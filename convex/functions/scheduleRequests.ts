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

async function getOrCreateRequest(
  ctx: MutationCtx,
  physicianId: Id<"physicians">,
  fiscalYearId: Id<"fiscalYears">,
) {
  const existing = await ctx.db
    .query("scheduleRequests")
    .withIndex("by_physician_fy", (q) =>
      q.eq("physicianId", physicianId).eq("fiscalYearId", fiscalYearId),
    )
    .collect();

  if (existing.length > 1) {
    throw new Error("Data integrity error: duplicate schedule requests for physician/fiscal year");
  }
  if (existing.length === 1) return existing[0];

  const requestId = await ctx.db.insert("scheduleRequests", {
    physicianId,
    fiscalYearId,
    status: "draft",
    rotationPreferenceApprovalStatus: "pending",
    rotationPreferenceApprovedAt: undefined,
    rotationPreferenceApprovedBy: undefined,
  });

  const created = await ctx.db.get(requestId);
  if (!created) {
    throw new Error("Failed to create schedule request");
  }
  return created;
}

function requireCollectingWindow(
  fiscalYear: Pick<Doc<"fiscalYears">, "status" | "requestDeadline">,
  now = Date.now(),
) {
  const fiscalYearStatus = fiscalYear.status as FiscalYearStatus;
  if (!canEditRequestForFiscalYear(fiscalYearStatus)) {
    throw new Error("Scheduling requests are only editable while fiscal year is collecting");
  }
  if (!isRequestDeadlineOpen(fiscalYear, now)) {
    throw new Error("Request deadline has passed for this fiscal year");
  }
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
      v.object({
        _id: v.id("scheduleRequests"),
        _creationTime: v.number(),
        physicianId: v.id("physicians"),
        fiscalYearId: v.id("fiscalYears"),
        status: v.union(v.literal("draft"), v.literal("submitted"), v.literal("revised")),
        submittedAt: v.optional(v.number()),
        specialRequests: v.optional(v.string()),
        rotationPreferenceApprovalStatus: v.optional(
          v.union(v.literal("pending"), v.literal("approved")),
        ),
        rotationPreferenceApprovedAt: v.optional(v.number()),
        rotationPreferenceApprovedBy: v.optional(v.id("physicians")),
      }),
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
      specialRequests: args.specialRequests,
      status: nextStatus,
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

    if (request.status === "submitted") {
      await ctx.db.patch(request._id, { status: "revised" });
    }

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

    if (request.status === "submitted") {
      await ctx.db.patch(request._id, { status: "revised" });
    }

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

    if (request.status === "submitted") {
      await ctx.db.patch(request._id, { status: "revised" });
    }

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

    await ctx.db.patch(request._id, {
      status: "submitted",
      submittedAt: Date.now(),
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
        status: v.union(v.literal("draft"), v.literal("submitted"), v.literal("revised")),
        submittedAt: v.optional(v.number()),
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
