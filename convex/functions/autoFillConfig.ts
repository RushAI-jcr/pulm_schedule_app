import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireAuthenticatedUser } from "../lib/auth";
import { DEFAULT_AUTO_FILL_CONFIG } from "../lib/autoFill";

export const getAutoFillConfig = query({
  args: { fiscalYearId: v.id("fiscalYears") },
  returns: v.object({
    weightPreference: v.number(),
    weightHolidayParity: v.number(),
    weightWorkloadSpread: v.number(),
    weightRotationVariety: v.number(),
    weightGapEnforcement: v.number(),
    majorHolidayNames: v.array(v.string()),
    minGapWeeksBetweenStints: v.number(),
    isDefault: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);

    const config = await ctx.db
      .query("autoFillConfig")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", args.fiscalYearId))
      .unique();

    if (!config) {
      return { ...DEFAULT_AUTO_FILL_CONFIG, isDefault: true };
    }

    return {
      weightPreference: config.weightPreference,
      weightHolidayParity: config.weightHolidayParity,
      weightWorkloadSpread: config.weightWorkloadSpread,
      weightRotationVariety: config.weightRotationVariety,
      weightGapEnforcement: config.weightGapEnforcement,
      majorHolidayNames: config.majorHolidayNames,
      minGapWeeksBetweenStints: config.minGapWeeksBetweenStints,
      isDefault: false,
    };
  },
});

export const upsertAutoFillConfig = mutation({
  args: {
    fiscalYearId: v.id("fiscalYears"),
    weightPreference: v.number(),
    weightHolidayParity: v.number(),
    weightWorkloadSpread: v.number(),
    weightRotationVariety: v.number(),
    weightGapEnforcement: v.number(),
    majorHolidayNames: v.array(v.string()),
    minGapWeeksBetweenStints: v.number(),
  },
  returns: v.object({ message: v.string() }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const fiscalYear = await ctx.db.get(args.fiscalYearId);
    if (!fiscalYear) throw new Error("Fiscal year not found");

    // Validate weights are non-negative
    const weights = [
      args.weightPreference,
      args.weightHolidayParity,
      args.weightWorkloadSpread,
      args.weightRotationVariety,
      args.weightGapEnforcement,
    ];
    for (const w of weights) {
      if (w < 0) throw new Error("Weights must be non-negative");
    }

    if (args.minGapWeeksBetweenStints < 0) {
      throw new Error("minGapWeeksBetweenStints must be non-negative");
    }

    const existing = await ctx.db
      .query("autoFillConfig")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", args.fiscalYearId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        weightPreference: args.weightPreference,
        weightHolidayParity: args.weightHolidayParity,
        weightWorkloadSpread: args.weightWorkloadSpread,
        weightRotationVariety: args.weightRotationVariety,
        weightGapEnforcement: args.weightGapEnforcement,
        majorHolidayNames: args.majorHolidayNames,
        minGapWeeksBetweenStints: args.minGapWeeksBetweenStints,
        updatedAt: Date.now(),
        updatedBy: admin.actorPhysicianId ?? undefined,
      });
      return { message: `Auto-fill config updated for ${fiscalYear.label}` };
    }

    await ctx.db.insert("autoFillConfig", {
      fiscalYearId: args.fiscalYearId,
      weightPreference: args.weightPreference,
      weightHolidayParity: args.weightHolidayParity,
      weightWorkloadSpread: args.weightWorkloadSpread,
      weightRotationVariety: args.weightRotationVariety,
      weightGapEnforcement: args.weightGapEnforcement,
      majorHolidayNames: args.majorHolidayNames,
      minGapWeeksBetweenStints: args.minGapWeeksBetweenStints,
      updatedAt: Date.now(),
      updatedBy: admin.actorPhysicianId ?? undefined,
    });
    return { message: `Auto-fill config created for ${fiscalYear.label}` };
  },
});
