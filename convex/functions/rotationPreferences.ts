import { mutation, query, MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { getCurrentPhysician, requireAdmin } from "../lib/auth";
import { canEditRequestForFiscalYear, FiscalYearStatus } from "../lib/workflowPolicy";
import { getSingleActiveFiscalYear, isRequestDeadlineOpen } from "../lib/fiscalYear";
import { enforceRateLimit } from "../lib/rateLimit";
import {
  getMissingActiveRotationIds,
  getRotationConfigurationIssues,
} from "../lib/rotationPreferenceReadiness";
import { sortActivePhysicians, sortActiveRotations } from "../lib/sorting";

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
  if (!created) throw new Error("Failed to create schedule request");
  return created;
}

function validatePreferenceInput(args: {
  preferenceRank?: number;
  avoid: boolean;
  deprioritize: boolean;
}) {
  if (args.preferenceRank !== undefined) {
    if (!Number.isInteger(args.preferenceRank) || args.preferenceRank < 1) {
      throw new Error("Preference rank must be a positive integer");
    }
  }

  if (args.avoid && args.preferenceRank !== undefined) {
    throw new Error("Cannot set both do-not-assign and preference rank for the same rotation");
  }
  if (args.avoid && args.deprioritize) {
    throw new Error("Cannot set both do-not-assign and do-not-prefer for the same rotation");
  }
  if (args.deprioritize && args.preferenceRank !== undefined) {
    throw new Error("Cannot set both do-not-prefer and preference rank for the same rotation");
  }
}

async function setRotationPreferenceApprovalPending(
  ctx: MutationCtx,
  request: Doc<"scheduleRequests">,
) {
  await ctx.db.patch(request._id, {
    rotationPreferenceApprovalStatus: "pending",
    rotationPreferenceApprovedAt: undefined,
    rotationPreferenceApprovedBy: undefined,
  });
}

export const getMyRotationPreferences = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const physician = await getCurrentPhysician(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);

    if (!fiscalYear) {
      return {
        fiscalYear: null,
        request: null,
        rotations: [],
        requiredCount: 0,
        configuredCount: 0,
        missingRotationNames: [],
        isComplete: false,
        approvalStatus: "pending" as const,
        isApprovedForMapping: false,
      };
    }

    const rotations = await ctx.db
      .query("rotations")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
      .collect();
    const activeRotations = sortActiveRotations(rotations);

    const request = await ctx.db
      .query("scheduleRequests")
      .withIndex("by_physician_fy", (q) =>
        q.eq("physicianId", physician._id).eq("fiscalYearId", fiscalYear._id),
      )
      .first();

    if (!request) {
      const missingRotationNames = activeRotations.map((rotation) => rotation.name);
      return {
        fiscalYear,
        request: null,
        rotations: activeRotations.map((rotation) => ({
          rotation,
          preference: null,
        })),
        requiredCount: missingRotationNames.length,
        configuredCount: 0,
        missingRotationNames,
        isComplete: false,
        approvalStatus: "pending" as const,
        isApprovedForMapping: false,
      };
    }

    const preferences = await ctx.db
      .query("rotationPreferences")
      .withIndex("by_request", (q) => q.eq("scheduleRequestId", request._id))
      .collect();

    const preferenceByRotationId = new Map(
      preferences.map((preference) => [String(preference.rotationId), preference]),
    );
    const missingRotationNames = activeRotations
      .filter((rotation) => !preferenceByRotationId.has(String(rotation._id)))
      .map((rotation) => rotation.name);
    const configuredCount = activeRotations.length - missingRotationNames.length;
    const approvalStatus = request.rotationPreferenceApprovalStatus ?? "pending";

    return {
      fiscalYear,
      request,
      rotations: activeRotations.map((rotation) => ({
        rotation,
        preference: preferenceByRotationId.get(String(rotation._id)) ?? null,
      })),
      requiredCount: activeRotations.length,
      configuredCount,
      missingRotationNames,
      isComplete: missingRotationNames.length === 0,
      approvalStatus,
      isApprovedForMapping: approvalStatus === "approved" && missingRotationNames.length === 0,
    };
  },
});

export const setMyRotationPreference = mutation({
  args: {
    rotationId: v.id("rotations"),
    preferenceRank: v.optional(v.number()),
    avoid: v.boolean(),
    deprioritize: v.optional(v.boolean()),
    avoidReason: v.optional(v.string()),
  },
  returns: v.object({ message: v.string() }),
  handler: async (ctx, args) => {
    const physician = await getCurrentPhysician(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) throw new Error("No fiscal year configured");

    requireCollectingWindow(fiscalYear);
    await enforceRateLimit(ctx, physician._id, "schedule_request_save");

    const rotation = await ctx.db.get(args.rotationId);
    if (!rotation || !rotation.isActive || rotation.fiscalYearId !== fiscalYear._id) {
      throw new Error("Invalid rotation selected");
    }

    const deprioritize = Boolean(args.deprioritize);
    validatePreferenceInput({
      preferenceRank: args.preferenceRank,
      avoid: args.avoid,
      deprioritize,
    });

    const request = await getOrCreateRequest(ctx, physician._id, fiscalYear._id);
    const existing = await ctx.db
      .query("rotationPreferences")
      .withIndex("by_request_rotation", (q) =>
        q.eq("scheduleRequestId", request._id).eq("rotationId", args.rotationId),
      )
      .first();

    const trimmedAvoidReason = args.avoidReason?.trim();
    const payload = {
      scheduleRequestId: request._id,
      rotationId: args.rotationId,
      preferenceRank: args.avoid ? undefined : args.preferenceRank,
      avoid: args.avoid,
      deprioritize: args.avoid ? false : deprioritize,
      avoidReason: args.avoid ? trimmedAvoidReason : undefined,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("rotationPreferences", payload);
    }

    await setRotationPreferenceApprovalPending(ctx, request);
    if (request.status === "submitted") {
      await ctx.db.patch(request._id, { status: "revised" });
    }

    return { message: "Rotation preference saved" };
  },
});

export const getAdminRotationPreferenceMatrix = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) {
      return {
        fiscalYear: null,
        rotations: [],
        physicians: [],
        rows: [],
        missingPreferencePhysicians: [],
        summary: {
          requiredCountPerPhysician: 0,
          readyForMappingCount: 0,
          pendingApprovalCount: 0,
          incompleteCount: 0,
        },
        rotationConfiguration: {
          isValid: false,
          missingRequiredNames: [],
          unexpectedNames: [],
          blockingReason: "No active fiscal year",
        },
      };
    }

    const [allRotations, allPhysicians, requests] = await Promise.all([
      ctx.db
        .query("rotations")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
      ctx.db.query("physicians").collect(),
      ctx.db
        .query("scheduleRequests")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
    ]);

    const rotations = sortActiveRotations(allRotations);
    const physicians = sortActivePhysicians(allPhysicians);
    const rotationConfiguration = getRotationConfigurationIssues(
      rotations.map((rotation) => rotation.name),
    );

    const sortedRequests = [...requests].sort((a, b) => {
      const bySubmittedAt = (b.submittedAt ?? 0) - (a.submittedAt ?? 0);
      if (bySubmittedAt !== 0) return bySubmittedAt;
      return b._creationTime - a._creationTime;
    });

    const requestByPhysician = new Map<string, Doc<"scheduleRequests">>();
    for (const request of sortedRequests) {
      const physicianId = String(request.physicianId);
      if (!requestByPhysician.has(physicianId)) {
        requestByPhysician.set(physicianId, request);
      }
    }

    const preferenceByPhysicianRotation = new Map<
      string,
      Map<string, Doc<"rotationPreferences">>
    >();
    await Promise.all(
      physicians.map(async (physician) => {
        const request = requestByPhysician.get(String(physician._id));
        if (!request) return;

        const preferences = await ctx.db
          .query("rotationPreferences")
          .withIndex("by_request", (q) => q.eq("scheduleRequestId", request._id))
          .collect();
        preferenceByPhysicianRotation.set(
          String(physician._id),
          new Map(preferences.map((preference) => [String(preference.rotationId), preference])),
        );
      }),
    );

    const activeRotationIds = rotations.map((rotation) => String(rotation._id));
    const activeRotationIdSet = new Set(activeRotationIds);

    const rows = physicians.map((physician) => {
      const physicianId = String(physician._id);
      const request = requestByPhysician.get(physicianId) ?? null;
      const preferences = preferenceByPhysicianRotation.get(physicianId) ?? new Map();
      const configuredRotationIds = Array.from(preferences.keys()).filter((rotationId) =>
        activeRotationIdSet.has(rotationId),
      );
      const missingRotationIds = getMissingActiveRotationIds({
        activeRotationIds,
        configuredRotationIds,
      });
      const missingRotationNameById = new Map(rotations.map((rotation) => [String(rotation._id), rotation.name]));
      const missingRotationNames = missingRotationIds
        .map((rotationId) => missingRotationNameById.get(rotationId))
        .filter((name): name is string => Boolean(name));
      const approvalStatus = request?.rotationPreferenceApprovalStatus ?? "pending";

      const blockingReasons: string[] = [];
      if (!request) {
        blockingReasons.push("No schedule request exists for this fiscal year.");
      }
      if (missingRotationNames.length > 0) {
        blockingReasons.push(`Missing preferences for: ${missingRotationNames.join(", ")}`);
      }
      if (approvalStatus !== "approved") {
        blockingReasons.push("Awaiting admin approval.");
      }
      if (!rotationConfiguration.isValid) {
        blockingReasons.push(
          "Active rotations must exactly match Pulm, MICU 1, MICU 2, AICU, LTAC, ROPH, IP, and PFT.",
        );
      }

      return {
        physicianId: physician._id,
        physicianName: `${physician.firstName} ${physician.lastName}`,
        physicianInitials: physician.initials,
        role: physician.role,
        requestId: request?._id ?? null,
        approvalStatus,
        configuredCount: configuredRotationIds.length,
        requiredCount: rotations.length,
        missingRotationNames,
        blockingReasons,
        isReadyForMapping:
          Boolean(request) &&
          missingRotationNames.length === 0 &&
          approvalStatus === "approved" &&
          rotationConfiguration.isValid,
        preferences: rotations.map((rotation) => ({
          rotationId: rotation._id,
          preference: preferences.get(String(rotation._id)) ?? null,
        })),
      };
    });

    const missingPreferencePhysicians = rows
      .filter((row) => row.missingRotationNames.length > 0)
      .map((row) => ({
        physicianId: row.physicianId,
        physicianName: row.physicianName,
        physicianInitials: row.physicianInitials,
      }));

    const summary = rows.reduce(
      (acc, row) => {
        if (row.isReadyForMapping) acc.readyForMappingCount += 1;
        if (row.approvalStatus !== "approved") acc.pendingApprovalCount += 1;
        if (row.missingRotationNames.length > 0 || !row.requestId) acc.incompleteCount += 1;
        return acc;
      },
      {
        requiredCountPerPhysician: rotations.length,
        readyForMappingCount: 0,
        pendingApprovalCount: 0,
        incompleteCount: 0,
      },
    );

    return {
      fiscalYear,
      rotations: rotations.map((rotation) => ({
        _id: rotation._id,
        name: rotation.name,
        abbreviation: rotation.abbreviation,
      })),
      physicians: physicians.map((physician) => ({
        _id: physician._id,
        fullName: `${physician.firstName} ${physician.lastName}`,
        initials: physician.initials,
        role: physician.role,
      })),
      rows,
      missingPreferencePhysicians,
      summary,
      rotationConfiguration: {
        ...rotationConfiguration,
        blockingReason: rotationConfiguration.isValid
          ? null
          : "Active rotations must exactly match Pulm, MICU 1, MICU 2, AICU, LTAC, ROPH, IP, and PFT.",
      },
    };
  },
});

export const setPhysicianRotationPreferenceByAdmin = mutation({
  args: {
    physicianId: v.id("physicians"),
    rotationId: v.id("rotations"),
    mode: v.union(
      v.literal("do_not_assign"),
      v.literal("deprioritize"),
      v.literal("willing"),
      v.literal("preferred"),
    ),
    preferenceRank: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  returns: v.object({ message: v.string() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) throw new Error("No fiscal year configured");
    if (fiscalYear.status === "published" || fiscalYear.status === "archived") {
      throw new Error("Rotation preferences are locked after publish/archive");
    }

    const [physician, rotation] = await Promise.all([
      ctx.db.get(args.physicianId),
      ctx.db.get(args.rotationId),
    ]);

    if (!physician || !physician.isActive) {
      throw new Error("Invalid physician selected");
    }
    if (!rotation || !rotation.isActive || rotation.fiscalYearId !== fiscalYear._id) {
      throw new Error("Invalid rotation selected");
    }

    const avoid = args.mode === "do_not_assign";
    const deprioritize = args.mode === "deprioritize";
    const preferenceRank = args.mode === "preferred" ? args.preferenceRank : undefined;
    const trimmedNote = args.note?.trim();

    validatePreferenceInput({
      preferenceRank,
      avoid,
      deprioritize,
    });

    if (args.mode === "preferred" && preferenceRank === undefined) {
      throw new Error("Preferred mode requires a positive integer rank");
    }

    const request = await getOrCreateRequest(ctx, physician._id, fiscalYear._id);
    const existing = await ctx.db
      .query("rotationPreferences")
      .withIndex("by_request_rotation", (q) =>
        q.eq("scheduleRequestId", request._id).eq("rotationId", rotation._id),
      )
      .first();

    const payload = {
      scheduleRequestId: request._id,
      rotationId: rotation._id,
      preferenceRank,
      avoid,
      deprioritize,
      avoidReason: avoid ? trimmedNote : undefined,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("rotationPreferences", payload);
    }

    await setRotationPreferenceApprovalPending(ctx, request);
    if (request.status === "submitted") {
      await ctx.db.patch(request._id, { status: "revised" });
    }

    return { message: "Rotation preference updated by admin" };
  },
});

export const approveRotationPreferencesForMapping = mutation({
  args: {
    physicianId: v.id("physicians"),
  },
  returns: v.object({ message: v.string() }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) throw new Error("No fiscal year configured");

    const [physician, activeRotations] = await Promise.all([
      ctx.db.get(args.physicianId),
      ctx.db
        .query("rotations")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
    ]);

    if (!physician || !physician.isActive) {
      throw new Error("Invalid physician selected");
    }

    const rotations = sortActiveRotations(activeRotations);
    const rotationConfigIssues = getRotationConfigurationIssues(
      rotations.map((rotation) => rotation.name),
    );
    if (!rotationConfigIssues.isValid) {
      throw new Error(
        "Cannot approve while active rotation names do not match Pulm, MICU 1, MICU 2, AICU, LTAC, ROPH, IP, and PFT.",
      );
    }

    const request = await ctx.db
      .query("scheduleRequests")
      .withIndex("by_physician_fy", (q) =>
        q.eq("physicianId", physician._id).eq("fiscalYearId", fiscalYear._id),
      )
      .first();
    if (!request) {
      throw new Error("Physician has no schedule request for the active fiscal year");
    }

    const preferences = await ctx.db
      .query("rotationPreferences")
      .withIndex("by_request", (q) => q.eq("scheduleRequestId", request._id))
      .collect();

    const missingRotationIds = getMissingActiveRotationIds({
      activeRotationIds: rotations.map((rotation) => String(rotation._id)),
      configuredRotationIds: Array.from(
        new Set(preferences.map((preference) => String(preference.rotationId))),
      ),
    });

    if (missingRotationIds.length > 0) {
      throw new Error("Cannot approve until every active rotation has an explicit preference.");
    }

    await ctx.db.patch(request._id, {
      rotationPreferenceApprovalStatus: "approved",
      rotationPreferenceApprovedAt: Date.now(),
      rotationPreferenceApprovedBy: admin.actorPhysicianId ?? undefined,
    });

    return { message: "Rotation preferences approved for calendar mapping" };
  },
});
