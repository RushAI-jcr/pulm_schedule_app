import { mutation, query, QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { getCurrentPhysician, requireAdmin, requireAuthenticatedUser } from "../lib/auth";
import {
  canEditRequestForFiscalYear,
  FiscalYearStatus,
  nextScheduleRequestStatusAfterSave,
} from "../lib/workflowPolicy";
import { enforceRateLimit } from "../lib/rateLimit";
import { getSingleActiveFiscalYear, isRequestDeadlineOpen } from "../lib/fiscalYear";
import {
  getMissingActiveRotationIds,
  getRotationConfigurationIssues,
} from "../lib/rotationPreferenceReadiness";
import {
  doesImportDoctorTokenMatch,
  getWeekCoverageDiff,
  mapUploadedWeeksToFiscalWeeks,
  normalizeImportFiscalYearLabel,
} from "../lib/scheduleImport";
import {
  buildRequestActivityPatch,
  requireCollectingWindow,
  getOrCreateRequest,
} from "../lib/scheduleRequestHelpers";
import { sortActivePhysicians } from "../lib/sorting";

const availabilityValidator = v.union(
  v.literal("green"),
  v.literal("yellow"),
  v.literal("red"),
);

const importAvailabilityValidator = v.union(
  v.literal("green"),
  v.literal("yellow"),
  v.literal("red"),
  v.literal("unset"),
);

type FunctionCtx = QueryCtx | MutationCtx;

const scheduleRequestStatusValidator = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("revised"),
);

const scheduleRequestRecordValidator = v.object({
  _id: v.id("scheduleRequests"),
  _creationTime: v.number(),
  physicianId: v.id("physicians"),
  fiscalYearId: v.id("fiscalYears"),
  status: scheduleRequestStatusValidator,
  submittedAt: v.optional(v.number()),
  lastActivityAt: v.optional(v.number()),
  revisionCount: v.optional(v.number()),
  specialRequests: v.optional(v.string()),
  rotationPreferenceApprovalStatus: v.optional(
    v.union(v.literal("pending"), v.literal("approved")),
  ),
  rotationPreferenceApprovedAt: v.optional(v.number()),
  rotationPreferenceApprovedBy: v.optional(v.id("physicians")),
});

const scheduleRequestInboxStatusValidator = v.union(
  v.literal("not_started"),
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("revised"),
);

type ScheduleRequestInboxStatus = "not_started" | "draft" | "submitted" | "revised";

function getRequestActivityTimestamp(request: Doc<"scheduleRequests">): number {
  return request.lastActivityAt ?? request.submittedAt ?? request._creationTime;
}

function getInboxStatusPriority(status: ScheduleRequestInboxStatus): number {
  if (status === "revised") return 0;
  if (status === "submitted") return 1;
  if (status === "draft") return 2;
  return 3;
}

export const getCurrentFiscalYearWeeks = query({
  args: {},
  returns: v.object({
    fiscalYear: v.union(
      v.null(),
      v.object({
        _id: v.id("fiscalYears"),
        _creationTime: v.number(),
        label: v.string(),
        startDate: v.string(),
        endDate: v.string(),
        status: v.union(
          v.literal("setup"),
          v.literal("collecting"),
          v.literal("building"),
          v.literal("published"),
          v.literal("archived"),
        ),
        requestDeadline: v.optional(v.string()),
      }),
    ),
    weeks: v.array(
      v.object({
        _id: v.id("weeks"),
        _creationTime: v.number(),
        fiscalYearId: v.id("fiscalYears"),
        weekNumber: v.number(),
        startDate: v.string(),
        endDate: v.string(),
      }),
    ),
  }),
  handler: async (ctx) => {
    await requireAuthenticatedUser(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) {
      return { fiscalYear: null, weeks: [] };
    }

    const weeks = await ctx.db
      .query("weeks")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
      .collect();

    weeks.sort((a, b) => a.weekNumber - b.weekNumber);

    return { fiscalYear, weeks };
  },
});

export const getMyScheduleRequest = query({
  args: {},
  returns: v.object({
    fiscalYear: v.union(
      v.null(),
      v.object({
        _id: v.id("fiscalYears"),
        _creationTime: v.number(),
        label: v.string(),
        startDate: v.string(),
        endDate: v.string(),
        status: v.union(
          v.literal("setup"),
          v.literal("collecting"),
          v.literal("building"),
          v.literal("published"),
          v.literal("archived"),
        ),
        requestDeadline: v.optional(v.string()),
      }),
    ),
    request: v.union(
      v.null(),
      scheduleRequestRecordValidator,
    ),
    weekPreferences: v.array(
      v.object({
        _id: v.id("weekPreferences"),
        _creationTime: v.number(),
        scheduleRequestId: v.id("scheduleRequests"),
        weekId: v.id("weeks"),
        availability: v.union(v.literal("green"), v.literal("yellow"), v.literal("red")),
        reasonCategory: v.optional(
          v.union(
            v.literal("vacation"),
            v.literal("conference"),
            v.literal("personal_religious"),
            v.literal("admin_leave"),
            v.literal("other"),
          ),
        ),
        reasonText: v.optional(v.string()),
        week: v.union(
          v.null(),
          v.object({
            _id: v.id("weeks"),
            _creationTime: v.number(),
            fiscalYearId: v.id("fiscalYears"),
            weekNumber: v.number(),
            startDate: v.string(),
            endDate: v.string(),
          }),
        ),
      }),
    ),
  }),
  handler: async (ctx) => {
    const physician = await getCurrentPhysician(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);

    if (!fiscalYear) {
      return { fiscalYear: null, request: null, weekPreferences: [] };
    }

    const request = await ctx.db
      .query("scheduleRequests")
      .withIndex("by_physician_fy", (q) =>
        q.eq("physicianId", physician._id).eq("fiscalYearId", fiscalYear._id),
      )
      .first();

    if (!request) {
      return { fiscalYear, request: null, weekPreferences: [] };
    }

    const preferences = await ctx.db
      .query("weekPreferences")
      .withIndex("by_request", (q) => q.eq("scheduleRequestId", request._id))
      .collect();

    const weeks = await ctx.db
      .query("weeks")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
      .collect();

    const weekById = new Map(weeks.map((w) => [w._id, w]));

    const weekPreferences = preferences
      .map((p) => ({
        ...p,
        week: weekById.get(p.weekId) ?? null,
      }))
      .filter((p) => p.week !== null)
      .sort((a, b) => a.week!.weekNumber - b.week!.weekNumber);

    return {
      fiscalYear,
      request,
      weekPreferences,
    };
  },
});

export const saveMyScheduleRequest = mutation({
  args: {
    specialRequests: v.optional(v.string()),
  },
  returns: v.object({ message: v.string() }),
  handler: async (ctx, args) => {
    const physician = await getCurrentPhysician(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) throw new Error("No fiscal year configured");

    requireCollectingWindow(fiscalYear);

    const request = await getOrCreateRequest(ctx, physician._id, fiscalYear._id);
    if (!request) throw new Error("Failed to load request");
    await enforceRateLimit(ctx, physician._id, "schedule_request_save");

    const nextStatus = nextScheduleRequestStatusAfterSave(request.status);

    await ctx.db.patch(request._id, {
      ...buildRequestActivityPatch({ request, nextStatus }),
      specialRequests: args.specialRequests,
    });

    return { message: "Request saved" };
  },
});

export const setMyWeekPreference = mutation({
  args: {
    weekId: v.id("weeks"),
    availability: availabilityValidator,
    reasonCategory: v.optional(
      v.union(
        v.literal("vacation"),
        v.literal("conference"),
        v.literal("personal_religious"),
        v.literal("admin_leave"),
        v.literal("other"),
      ),
    ),
    reasonText: v.optional(v.string()),
  },
  returns: v.object({ message: v.string() }),
  handler: async (ctx, args) => {
    const physician = await getCurrentPhysician(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) throw new Error("No fiscal year configured");

    requireCollectingWindow(fiscalYear);

    const week = await ctx.db.get(args.weekId);
    if (!week || week.fiscalYearId !== fiscalYear._id) {
      throw new Error("Invalid week selected");
    }

    const request = await getOrCreateRequest(ctx, physician._id, fiscalYear._id);
    if (!request) throw new Error("Failed to load request");
    await enforceRateLimit(ctx, physician._id, "schedule_week_preference_set");

    const existing = await ctx.db
      .query("weekPreferences")
      .withIndex("by_request_week", (q) =>
        q.eq("scheduleRequestId", request._id).eq("weekId", args.weekId),
      )
      .first();

    const payload = {
      scheduleRequestId: request._id,
      weekId: args.weekId,
      availability: args.availability,
      reasonCategory: args.reasonCategory,
      reasonText: args.reasonText,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("weekPreferences", payload);
    }

    await ctx.db.patch(
      request._id,
      buildRequestActivityPatch({
        request,
        nextStatus: request.status === "submitted" ? "revised" : request.status,
      }),
    );

    return { message: "Week preference saved" };
  },
});

export const batchSetWeekPreferences = mutation({
  args: {
    preferences: v.array(
      v.object({
        weekId: v.id("weeks"),
        availability: availabilityValidator,
        reasonCategory: v.optional(
          v.union(
            v.literal("vacation"),
            v.literal("conference"),
            v.literal("personal_religious"),
            v.literal("admin_leave"),
            v.literal("other"),
          ),
        ),
        reasonText: v.optional(v.string()),
      }),
    ),
  },
  returns: v.object({ message: v.string(), count: v.number() }),
  handler: async (ctx, args) => {
    const physician = await getCurrentPhysician(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) throw new Error("No fiscal year configured");

    requireCollectingWindow(fiscalYear);

    const request = await getOrCreateRequest(ctx, physician._id, fiscalYear._id);
    if (!request) throw new Error("Failed to load request");
    await enforceRateLimit(ctx, physician._id, "schedule_week_preference_set");

    for (const pref of args.preferences) {
      const week = await ctx.db.get(pref.weekId);
      if (!week || week.fiscalYearId !== fiscalYear._id) {
        throw new Error(`Invalid week: ${pref.weekId}`);
      }

      const existing = await ctx.db
        .query("weekPreferences")
        .withIndex("by_request_week", (q) =>
          q.eq("scheduleRequestId", request._id).eq("weekId", pref.weekId),
        )
        .first();

      const payload = {
        scheduleRequestId: request._id,
        weekId: pref.weekId,
        availability: pref.availability,
        reasonCategory: pref.reasonCategory,
        reasonText: pref.reasonText,
      };

      if (existing) {
        await ctx.db.patch(existing._id, payload);
      } else {
        await ctx.db.insert("weekPreferences", payload);
      }
    }

    await ctx.db.patch(
      request._id,
      buildRequestActivityPatch({
        request,
        nextStatus: request.status === "submitted" ? "revised" : request.status,
      }),
    );

    return { message: `Saved ${args.preferences.length} week preferences`, count: args.preferences.length };
  },
});

export const importWeekPreferencesFromUpload = mutation({
  args: {
    targetPhysicianId: v.optional(v.id("physicians")),
    sourceFileName: v.string(),
    sourceDoctorToken: v.string(),
    sourceFiscalYearLabel: v.string(),
    weeks: v.array(
      v.object({
        weekStart: v.string(),
        weekEnd: v.optional(v.string()),
        availability: importAvailabilityValidator,
      }),
    ),
  },
  returns: v.object({
    message: v.string(),
    physicianId: v.id("physicians"),
    fiscalYearLabel: v.string(),
    importedCount: v.number(),
    clearedCount: v.number(),
    counts: v.object({
      red: v.number(),
      yellow: v.number(),
      green: v.number(),
      unset: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    const currentUser = await requireAuthenticatedUser(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) throw new Error("No fiscal year configured");

    requireCollectingWindow(fiscalYear);
    if (currentUser.physician) {
      await enforceRateLimit(ctx, currentUser.physician._id, "schedule_request_import");
    }

    let targetPhysician = currentUser.physician;
    if (args.targetPhysicianId) {
      const selected = await ctx.db.get(args.targetPhysicianId);
      if (!selected) {
        throw new Error("Target physician not found");
      }

      const isSelfTarget = currentUser.physician
        ? selected._id === currentUser.physician._id
        : false;
      if (!isSelfTarget && currentUser.role !== "admin") {
        throw new Error("Admin access required");
      }
      targetPhysician = selected;
    } else if (!targetPhysician) {
      if (currentUser.role === "admin") {
        throw new Error("Select a target physician for import");
      }
      throw new Error("Signed-in account is not linked to a physician profile");
    }

    if (!targetPhysician.isActive) {
      throw new Error("Target physician is inactive");
    }

    const normalizedSourceFy = normalizeImportFiscalYearLabel(args.sourceFiscalYearLabel);
    const normalizedActiveFy = normalizeImportFiscalYearLabel(fiscalYear.label);
    if (normalizedSourceFy !== normalizedActiveFy) {
      throw new Error(
        `Uploaded file FY (${normalizedSourceFy}) does not match active fiscal year (${normalizedActiveFy})`,
      );
    }

    if (
      !doesImportDoctorTokenMatch(args.sourceDoctorToken, {
        lastName: targetPhysician.lastName,
        initials: targetPhysician.initials,
      })
    ) {
      throw new Error(
        `Uploaded file doctor token (${args.sourceDoctorToken}) does not match selected physician (${targetPhysician.lastName} / ${targetPhysician.initials})`,
      );
    }

    const fiscalWeeks = await ctx.db
      .query("weeks")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
      .collect();
    fiscalWeeks.sort((a, b) => a.weekNumber - b.weekNumber);

    const expectedWeekStarts = fiscalWeeks.map((week) => week.startDate);
    const uploadedWeekStarts = args.weeks.map((week) => week.weekStart);
    const { missing, unknown, duplicates } = getWeekCoverageDiff(
      expectedWeekStarts,
      uploadedWeekStarts,
    );

    if (duplicates.length > 0) {
      throw new Error(`Upload contains duplicate week_start values: ${duplicates.join(", ")}`);
    }

    if (unknown.length > 0) {
      throw new Error(`Upload contains unknown week_start values: ${unknown.join(", ")}`);
    }

    if (missing.length > 0) {
      throw new Error(`Upload is missing week_start values: ${missing.join(", ")}`);
    }

    if (args.weeks.length !== fiscalWeeks.length) {
      throw new Error(
        `Upload must include exactly ${fiscalWeeks.length} weeks, found ${args.weeks.length}`,
      );
    }

    const mappedWeeks = mapUploadedWeeksToFiscalWeeks({
      expectedWeeks: fiscalWeeks.map((week) => ({
        _id: week._id,
        startDate: week.startDate,
      })),
      uploadedWeeks: args.weeks.map((week) => ({
        weekStart: week.weekStart,
        availability: week.availability,
      })),
    });

    if (mappedWeeks.length !== fiscalWeeks.length) {
      throw new Error("Upload week mapping failed due to unknown week_start values");
    }

    const request = await getOrCreateRequest(ctx, targetPhysician._id, fiscalYear._id);
    const existing = await ctx.db
      .query("weekPreferences")
      .withIndex("by_request", (q) => q.eq("scheduleRequestId", request._id))
      .collect();

    for (const preference of existing) {
      await ctx.db.delete(preference._id);
    }

    const counts = {
      red: 0,
      yellow: 0,
      green: 0,
      unset: 0,
    };

    for (const mappedWeek of mappedWeeks) {
      counts[mappedWeek.availability] += 1;
      if (mappedWeek.availability === "unset") {
        continue;
      }

      await ctx.db.insert("weekPreferences", {
        scheduleRequestId: request._id,
        weekId: mappedWeek.weekId,
        availability: mappedWeek.availability,
      });
    }

    await ctx.db.patch(
      request._id,
      buildRequestActivityPatch({
        request,
        nextStatus: request.status === "submitted" ? "revised" : request.status,
      }),
    );

    const importedCount = counts.red + counts.yellow + counts.green;
    const clearedCount = counts.unset;

    return {
      message: `Imported ${importedCount} week preferences from ${args.sourceFileName}`,
      physicianId: targetPhysician._id,
      fiscalYearLabel: fiscalYear.label,
      importedCount,
      clearedCount,
      counts,
    };
  },
});

export const submitMyScheduleRequest = mutation({
  args: {},
  returns: v.object({ message: v.string() }),
  handler: async (ctx) => {
    const physician = await getCurrentPhysician(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) throw new Error("No fiscal year configured");

    requireCollectingWindow(fiscalYear);

    const request = await getOrCreateRequest(ctx, physician._id, fiscalYear._id);
    if (!request) throw new Error("Failed to load request");
    await enforceRateLimit(ctx, physician._id, "schedule_request_submit");

    const activeRotations = (
      await ctx.db
        .query("rotations")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect()
    )
      .filter((rotation) => rotation.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const rotationConfigIssues = getRotationConfigurationIssues(
      activeRotations.map((rotation) => rotation.name),
    );
    if (!rotationConfigIssues.isValid) {
      throw new Error(
        "Active rotation setup is incomplete. Ask an admin to finalize Pulm, MICU 1, MICU 2, AICU, LTAC, ROPH, IP, and PFT before submitting.",
      );
    }

    const preferenceRows = await ctx.db
      .query("rotationPreferences")
      .withIndex("by_request", (q) => q.eq("scheduleRequestId", request._id))
      .collect();
    const missingRotationIds = getMissingActiveRotationIds({
      activeRotationIds: activeRotations.map((rotation) => String(rotation._id)),
      configuredRotationIds: Array.from(
        new Set(preferenceRows.map((preference) => String(preference.rotationId))),
      ),
    });
    if (missingRotationIds.length > 0) {
      throw new Error(
        `Set preferences for all active rotations before submitting (${activeRotations.length} required, ${missingRotationIds.length} missing).`,
      );
    }

    const submittedAt = Date.now();
    await ctx.db.patch(request._id, {
      ...buildRequestActivityPatch({
        request,
        nextStatus: "submitted",
        now: submittedAt,
      }),
      submittedAt,
    });

    return { message: "Schedule request submitted" };
  },
});

export const getAdminScheduleRequests = query({
  args: {},
  returns: v.object({
    fiscalYear: v.union(
      v.null(),
      v.object({
        _id: v.id("fiscalYears"),
        _creationTime: v.number(),
        label: v.string(),
        startDate: v.string(),
        endDate: v.string(),
        status: v.union(
          v.literal("setup"),
          v.literal("collecting"),
          v.literal("building"),
          v.literal("published"),
          v.literal("archived"),
        ),
        requestDeadline: v.optional(v.string()),
      }),
    ),
    requests: v.array(
      v.object({
        _id: v.id("scheduleRequests"),
        _creationTime: v.number(),
        physicianId: v.id("physicians"),
        fiscalYearId: v.id("fiscalYears"),
        status: scheduleRequestStatusValidator,
        submittedAt: v.optional(v.number()),
        lastActivityAt: v.optional(v.number()),
        revisionCount: v.optional(v.number()),
        specialRequests: v.optional(v.string()),
        rotationPreferenceApprovalStatus: v.optional(
          v.union(v.literal("pending"), v.literal("approved")),
        ),
        rotationPreferenceApprovedAt: v.optional(v.number()),
        rotationPreferenceApprovedBy: v.optional(v.id("physicians")),
        physicianName: v.string(),
        physicianInitials: v.string(),
        preferenceCount: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) {
      return { fiscalYear: null, requests: [] };
    }

    const requests = await ctx.db
      .query("scheduleRequests")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
      .collect();

    const hydrated: Array<
      Doc<"scheduleRequests"> & {
        physicianName: string;
        physicianInitials: string;
        preferenceCount: number;
      }
    > = [];
    for (const request of requests) {
      const physician = await ctx.db.get(request.physicianId);
      const preferenceCount = (
        await ctx.db
          .query("weekPreferences")
          .withIndex("by_request", (q) => q.eq("scheduleRequestId", request._id))
          .collect()
      ).length;

      hydrated.push({
        ...request,
        physicianName: physician
          ? `${physician.firstName} ${physician.lastName}`
          : "Unknown Physician",
        physicianInitials: physician?.initials ?? "--",
        preferenceCount,
      });
    }

    hydrated.sort((a, b) => {
      if (a.status === b.status) {
        return a.physicianName.localeCompare(b.physicianName);
      }
      return a.status.localeCompare(b.status);
    });

    return { fiscalYear, requests: hydrated };
  },
});

async function buildAdminRequestInboxState(
  ctx: FunctionCtx,
  fiscalYearId: Id<"fiscalYears">,
) {
  const [allPhysicians, requests, reviews] = await Promise.all([
    ctx.db.query("physicians").collect(),
    ctx.db
      .query("scheduleRequests")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYearId))
      .collect(),
    ctx.db
      .query("scheduleRequestInboxReview")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYearId))
      .collect(),
  ]);

  const physicians = sortActivePhysicians(allPhysicians);

  const sortedRequests = [...requests].sort((a, b) => {
    const byActivity = getRequestActivityTimestamp(b) - getRequestActivityTimestamp(a);
    if (byActivity !== 0) return byActivity;
    return b._creationTime - a._creationTime;
  });

  const requestByPhysician = new Map<string, Doc<"scheduleRequests">>();
  for (const request of sortedRequests) {
    const physicianKey = String(request.physicianId);
    if (!requestByPhysician.has(physicianKey)) {
      requestByPhysician.set(physicianKey, request);
    }
  }

  const reviewByPhysician = new Map<string, Doc<"scheduleRequestInboxReview">>();
  for (const review of reviews) {
    const physicianKey = String(review.physicianId);
    const existing = reviewByPhysician.get(physicianKey);
    if (!existing || review.updatedAt > existing.updatedAt) {
      reviewByPhysician.set(physicianKey, review);
    }
  }

  const rows = await Promise.all(
    physicians.map(async (physician) => {
      const physicianId = String(physician._id);
      const request = requestByPhysician.get(physicianId) ?? null;
      const review = reviewByPhysician.get(physicianId) ?? null;

      const status: ScheduleRequestInboxStatus = request ? request.status : "not_started";
      const lastActivityAt = request ? getRequestActivityTimestamp(request) : null;
      const lastReviewedAt = review?.lastReviewedAt ?? null;
      const isNewOrRevisedSinceReview = request
        ? lastReviewedAt === null || (lastActivityAt !== null && lastActivityAt > lastReviewedAt)
        : false;

      let weekPreferenceCount = 0;
      let rotationPreferenceCount = 0;
      if (request) {
        [weekPreferenceCount, rotationPreferenceCount] = await Promise.all([
          ctx.db
            .query("weekPreferences")
            .withIndex("by_request", (q) => q.eq("scheduleRequestId", request._id))
            .collect()
            .then((rows) => rows.length),
          ctx.db
            .query("rotationPreferences")
            .withIndex("by_request", (q) => q.eq("scheduleRequestId", request._id))
            .collect()
            .then((rows) => rows.length),
        ]);
      }

      return {
        physicianId: physician._id,
        physicianName: `${physician.firstName} ${physician.lastName}`,
        physicianInitials: physician.initials,
        role: physician.role,
        requestId: request?._id ?? null,
        status,
        submittedAt: request?.submittedAt ?? null,
        lastActivityAt,
        lastReviewedAt,
        revisionCount: request?.revisionCount ?? 0,
        rotationPreferenceApprovalStatus: request?.rotationPreferenceApprovalStatus ?? null,
        weekPreferenceCount,
        rotationPreferenceCount,
        isNewOrRevisedSinceReview,
      };
    }),
  );

  rows.sort((a, b) => {
    if (a.isNewOrRevisedSinceReview !== b.isNewOrRevisedSinceReview) {
      return a.isNewOrRevisedSinceReview ? -1 : 1;
    }
    const byStatus = getInboxStatusPriority(a.status) - getInboxStatusPriority(b.status);
    if (byStatus !== 0) return byStatus;
    return a.physicianName.localeCompare(b.physicianName);
  });

  const summary = rows.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.status === "not_started") acc.notStarted += 1;
      if (row.status === "draft") acc.draft += 1;
      if (row.status === "submitted") acc.submitted += 1;
      if (row.status === "revised") acc.revised += 1;
      if (row.isNewOrRevisedSinceReview) acc.newOrRevised += 1;
      return acc;
    },
    {
      total: 0,
      notStarted: 0,
      draft: 0,
      submitted: 0,
      revised: 0,
      newOrRevised: 0,
    },
  );

  return {
    rows,
    summary,
    badgeCount: summary.newOrRevised,
  };
}

export const getAdminRequestInbox = query({
  args: {},
  returns: v.object({
    fiscalYear: v.union(
      v.null(),
      v.object({
        _id: v.id("fiscalYears"),
        _creationTime: v.number(),
        label: v.string(),
        startDate: v.string(),
        endDate: v.string(),
        status: v.union(
          v.literal("setup"),
          v.literal("collecting"),
          v.literal("building"),
          v.literal("published"),
          v.literal("archived"),
        ),
        requestDeadline: v.optional(v.string()),
      }),
    ),
    badgeCount: v.number(),
    summary: v.object({
      total: v.number(),
      notStarted: v.number(),
      draft: v.number(),
      submitted: v.number(),
      revised: v.number(),
      newOrRevised: v.number(),
    }),
    rows: v.array(
      v.object({
        physicianId: v.id("physicians"),
        physicianName: v.string(),
        physicianInitials: v.string(),
        role: v.union(v.literal("physician"), v.literal("admin")),
        requestId: v.union(v.null(), v.id("scheduleRequests")),
        status: scheduleRequestInboxStatusValidator,
        submittedAt: v.union(v.null(), v.number()),
        lastActivityAt: v.union(v.null(), v.number()),
        lastReviewedAt: v.union(v.null(), v.number()),
        revisionCount: v.number(),
        rotationPreferenceApprovalStatus: v.union(
          v.null(),
          v.literal("pending"),
          v.literal("approved"),
        ),
        weekPreferenceCount: v.number(),
        rotationPreferenceCount: v.number(),
        isNewOrRevisedSinceReview: v.boolean(),
      }),
    ),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) {
      return {
        fiscalYear: null,
        badgeCount: 0,
        summary: {
          total: 0,
          notStarted: 0,
          draft: 0,
          submitted: 0,
          revised: 0,
          newOrRevised: 0,
        },
        rows: [],
      };
    }

    const state = await buildAdminRequestInboxState(ctx, fiscalYear._id);
    return {
      fiscalYear,
      badgeCount: state.badgeCount,
      summary: state.summary,
      rows: state.rows,
    };
  },
});

export const getAdminRequestInboxBadgeCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) return 0;

    const state = await buildAdminRequestInboxState(ctx, fiscalYear._id);
    return state.badgeCount;
  },
});

export const markAdminRequestThreadReviewed = mutation({
  args: {
    physicianId: v.id("physicians"),
  },
  returns: v.object({
    message: v.string(),
    lastReviewedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (!admin.actorPhysicianId) {
      throw new Error("Admin account must be linked to a physician profile");
    }

    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) {
      throw new Error("No active fiscal year");
    }

    const physician = await ctx.db.get(args.physicianId);
    if (!physician || !physician.isActive) {
      throw new Error("Physician not found");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("scheduleRequestInboxReview")
      .withIndex("by_fiscalYear_physician", (q) =>
        q.eq("fiscalYearId", fiscalYear._id).eq("physicianId", args.physicianId),
      )
      .collect();

    if (existing.length === 0) {
      await ctx.db.insert("scheduleRequestInboxReview", {
        fiscalYearId: fiscalYear._id,
        physicianId: args.physicianId,
        lastReviewedAt: now,
        reviewedBy: admin.actorPhysicianId,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const latest = [...existing].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      await ctx.db.patch(latest._id, {
        lastReviewedAt: now,
        reviewedBy: admin.actorPhysicianId,
        updatedAt: now,
      });
    }

    return {
      message: "Request thread marked as reviewed",
      lastReviewedAt: now,
    };
  },
});

export const markAllAdminRequestThreadsReviewed = mutation({
  args: {},
  returns: v.object({
    message: v.string(),
    updatedCount: v.number(),
    lastReviewedAt: v.number(),
  }),
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    if (!admin.actorPhysicianId) {
      throw new Error("Admin account must be linked to a physician profile");
    }

    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) {
      throw new Error("No active fiscal year");
    }

    const [requests, existingReviews] = await Promise.all([
      ctx.db
        .query("scheduleRequests")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
      ctx.db
        .query("scheduleRequestInboxReview")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
    ]);

    const reviewByPhysician = new Map<string, Doc<"scheduleRequestInboxReview">>();
    for (const review of existingReviews) {
      const physicianKey = String(review.physicianId);
      const current = reviewByPhysician.get(physicianKey);
      if (!current || review.updatedAt > current.updatedAt) {
        reviewByPhysician.set(physicianKey, review);
      }
    }

    const physicianIdByKey = new Map<string, Id<"physicians">>();
    for (const request of requests) {
      physicianIdByKey.set(String(request.physicianId), request.physicianId);
    }
    const now = Date.now();
    let updatedCount = 0;

    for (const [physicianKey, physicianId] of physicianIdByKey.entries()) {
      const review = reviewByPhysician.get(physicianKey);
      if (!review) {
        await ctx.db.insert("scheduleRequestInboxReview", {
          fiscalYearId: fiscalYear._id,
          physicianId,
          lastReviewedAt: now,
          reviewedBy: admin.actorPhysicianId,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await ctx.db.patch(review._id, {
          lastReviewedAt: now,
          reviewedBy: admin.actorPhysicianId,
          updatedAt: now,
        });
      }
      updatedCount += 1;
    }

    return {
      message: "Marked all request threads as reviewed",
      updatedCount,
      lastReviewedAt: now,
    };
  },
});
