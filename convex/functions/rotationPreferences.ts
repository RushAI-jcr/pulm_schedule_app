import { mutation, query, MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { getCurrentPhysician } from "../lib/auth";
import { canEditRequestForFiscalYear, FiscalYearStatus } from "../lib/workflowPolicy";
import { getSingleActiveFiscalYear, isRequestDeadlineOpen } from "../lib/fiscalYear";
import { enforceRateLimit } from "../lib/rateLimit";

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
  });

  const created = await ctx.db.get(requestId);
  if (!created) throw new Error("Failed to create schedule request");
  return created;
}

export const getMyRotationPreferences = query({
  args: {},
  handler: async (ctx) => {
    const physician = await getCurrentPhysician(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);

    if (!fiscalYear) {
      return { fiscalYear: null, request: null, rotations: [] };
    }

    const rotations = await ctx.db
      .query("rotations")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
      .collect();
    rotations.sort((a, b) => a.sortOrder - b.sortOrder);

    const request = await ctx.db
      .query("scheduleRequests")
      .withIndex("by_physician_fy", (q) =>
        q.eq("physicianId", physician._id).eq("fiscalYearId", fiscalYear._id),
      )
      .first();

    if (!request) {
      return {
        fiscalYear,
        request: null,
        rotations: rotations.map((rotation) => ({
          rotation,
          preference: null,
        })),
      };
    }

    const preferences = await ctx.db
      .query("rotationPreferences")
      .withIndex("by_request", (q) => q.eq("scheduleRequestId", request._id))
      .collect();

    const preferenceByRotationId = new Map(
      preferences.map((preference) => [String(preference.rotationId), preference]),
    );

    return {
      fiscalYear,
      request,
      rotations: rotations.map((rotation) => ({
        rotation,
        preference: preferenceByRotationId.get(String(rotation._id)) ?? null,
      })),
    };
  },
});

export const setMyRotationPreference = mutation({
  args: {
    rotationId: v.id("rotations"),
    preferenceRank: v.optional(v.number()),
    avoid: v.boolean(),
    avoidReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const physician = await getCurrentPhysician(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) throw new Error("No fiscal year configured");

    requireCollectingWindow(fiscalYear);
    await enforceRateLimit(ctx, physician._id, "schedule_request_save");

    const rotation = await ctx.db.get(args.rotationId);
    if (!rotation || rotation.fiscalYearId !== fiscalYear._id) {
      throw new Error("Invalid rotation selected");
    }

    if (args.preferenceRank !== undefined) {
      if (!Number.isInteger(args.preferenceRank) || args.preferenceRank < 1) {
        throw new Error("Preference rank must be a positive integer");
      }
    }

    if (args.avoid && args.preferenceRank !== undefined) {
      throw new Error("Cannot set both avoid and preference rank for the same rotation");
    }

    const request = await getOrCreateRequest(ctx, physician._id, fiscalYear._id);
    const existing = await ctx.db
      .query("rotationPreferences")
      .withIndex("by_request_rotation", (q) =>
        q.eq("scheduleRequestId", request._id).eq("rotationId", args.rotationId),
      )
      .first();

    const trimmedAvoidReason = args.avoidReason?.trim();
    const shouldDelete =
      !args.avoid &&
      args.preferenceRank === undefined &&
      (!trimmedAvoidReason || trimmedAvoidReason.length === 0);

    if (shouldDelete) {
      if (existing) {
        await ctx.db.delete(existing._id);
      }
    } else {
      const payload = {
        scheduleRequestId: request._id,
        rotationId: args.rotationId,
        preferenceRank: args.avoid ? undefined : args.preferenceRank,
        avoid: args.avoid,
        avoidReason: args.avoid ? trimmedAvoidReason : undefined,
      };

      if (existing) {
        await ctx.db.patch(existing._id, payload);
      } else {
        await ctx.db.insert("rotationPreferences", payload);
      }
    }

    if (request.status === "submitted") {
      await ctx.db.patch(request._id, { status: "revised" });
    }

    return { message: "Rotation preference saved" };
  },
});
