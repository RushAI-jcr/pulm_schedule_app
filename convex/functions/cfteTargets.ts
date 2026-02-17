import { mutation, query, QueryCtx, MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "../lib/auth";
import { isValidTargetCfte } from "../lib/cfteTargets";
import { getSingleActiveFiscalYear } from "../lib/fiscalYear";

async function getCurrentFiscalYearForAdmin(ctx: QueryCtx | MutationCtx) {
  await requireAdmin(ctx);
  return await getSingleActiveFiscalYear(ctx);
}

export const getCurrentFiscalYearCfteTargets = query({
  args: {},
  returns: v.union(
    v.object({
      fiscalYear: v.null(),
      targets: v.array(v.any()),
    }),
    v.object({
      fiscalYear: v.object({
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
      targets: v.array(
        v.object({
          physicianId: v.id("physicians"),
          physicianName: v.string(),
          initials: v.string(),
          role: v.union(v.literal("admin"), v.literal("physician")),
          targetCfte: v.union(v.number(), v.null()),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const fiscalYear = await getCurrentFiscalYearForAdmin(ctx);
    if (!fiscalYear) {
      return { fiscalYear: null, targets: [] };
    }

    const physicians = await ctx.db.query("physicians").collect();
    const activePhysicians = physicians
      .filter((physician) => physician.isActive)
      .sort((a, b) => {
        const byLast = a.lastName.localeCompare(b.lastName);
        if (byLast !== 0) return byLast;
        return a.firstName.localeCompare(b.firstName);
      });

    const targetRows = await ctx.db
      .query("physicianCfteTargets")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
      .collect();

    const targetByPhysicianId = new Map(
      targetRows.map((target) => [String(target.physicianId), target]),
    );

    return {
      fiscalYear,
      targets: activePhysicians.map((physician) => {
        const existingTarget = targetByPhysicianId.get(String(physician._id));
        return {
          physicianId: physician._id,
          physicianName: `${physician.lastName}, ${physician.firstName}`,
          initials: physician.initials,
          role: physician.role,
          targetCfte: existingTarget?.targetCfte ?? null,
        };
      }),
    };
  },
});

export const upsertCurrentFiscalYearCfteTarget = mutation({
  args: {
    physicianId: v.id("physicians"),
    targetCfte: v.number(),
  },
  returns: v.object({ message: v.string() }),
  handler: async (ctx, args) => {
    const fiscalYear = await getCurrentFiscalYearForAdmin(ctx);
    if (!fiscalYear) throw new Error("No active fiscal year available");

    if (!isValidTargetCfte(args.targetCfte)) {
      throw new Error("Target cFTE must be between 0.00 and 1.50");
    }

    const physician = await ctx.db.get(args.physicianId);
    if (!physician || !physician.isActive) throw new Error("Physician not found");

    const existing = await ctx.db
      .query("physicianCfteTargets")
      .withIndex("by_physician_fy", (q) =>
        q.eq("physicianId", args.physicianId).eq("fiscalYearId", fiscalYear._id),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { targetCfte: args.targetCfte });
      return { message: "cFTE target updated" };
    }

    await ctx.db.insert("physicianCfteTargets", {
      physicianId: args.physicianId,
      fiscalYearId: fiscalYear._id,
      targetCfte: args.targetCfte,
    });

    return { message: "cFTE target created" };
  },
});
