import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "../lib/auth";

export const listPhysicianRotationRules = query({
  args: { fiscalYearId: v.id("fiscalYears") },
  returns: v.array(
    v.object({
      _id: v.id("physicianRotationRules"),
      physicianId: v.id("physicians"),
      physicianInitials: v.string(),
      physicianName: v.string(),
      rotationId: v.id("rotations"),
      rotationName: v.string(),
      rotationAbbreviation: v.string(),
      maxConsecutiveWeeks: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const rules = await ctx.db
      .query("physicianRotationRules")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", args.fiscalYearId))
      .collect();

    const result = await Promise.all(
      rules.map(async (rule) => {
        const [physician, rotation] = await Promise.all([
          ctx.db.get(rule.physicianId),
          ctx.db.get(rule.rotationId),
        ]);
        return {
          _id: rule._id,
          physicianId: rule.physicianId,
          physicianInitials: physician?.initials ?? "??",
          physicianName: physician
            ? `${physician.lastName}, ${physician.firstName}`
            : "Unknown",
          rotationId: rule.rotationId,
          rotationName: rotation?.name ?? "Unknown",
          rotationAbbreviation: rotation?.abbreviation ?? "??",
          maxConsecutiveWeeks: rule.maxConsecutiveWeeks,
        };
      }),
    );

    result.sort((a, b) =>
      a.physicianInitials.localeCompare(b.physicianInitials) ||
      a.rotationAbbreviation.localeCompare(b.rotationAbbreviation)
    );

    return result;
  },
});

export const upsertPhysicianRotationRule = mutation({
  args: {
    physicianId: v.id("physicians"),
    rotationId: v.id("rotations"),
    fiscalYearId: v.id("fiscalYears"),
    maxConsecutiveWeeks: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    if (args.maxConsecutiveWeeks < 1 || args.maxConsecutiveWeeks > 52) {
      throw new Error("Max consecutive weeks must be between 1 and 52");
    }

    const existing = await ctx.db
      .query("physicianRotationRules")
      .withIndex("by_physician_rotation_fy", (q) =>
        q
          .eq("physicianId", args.physicianId)
          .eq("rotationId", args.rotationId)
          .eq("fiscalYearId", args.fiscalYearId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        maxConsecutiveWeeks: args.maxConsecutiveWeeks,
      });
    } else {
      await ctx.db.insert("physicianRotationRules", {
        physicianId: args.physicianId,
        rotationId: args.rotationId,
        fiscalYearId: args.fiscalYearId,
        maxConsecutiveWeeks: args.maxConsecutiveWeeks,
      });
    }
    return null;
  },
});

export const deletePhysicianRotationRule = mutation({
  args: { ruleId: v.id("physicianRotationRules") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.delete(args.ruleId);
    return null;
  },
});

export const seedPhysicianRotationRules = mutation({
  args: { fiscalYearId: v.id("fiscalYears") },
  returns: v.object({ message: v.string(), seeded: v.number() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    // Hardcoded rules from the pre-DB era — seed them idempotently
    const knownRules = [
      { initials: "JG", abbreviation: "MICU 1", maxConsecutiveWeeks: 2 },
      { initials: "JG", abbreviation: "MICU 2", maxConsecutiveWeeks: 2 },
      { initials: "JG", abbreviation: "AICU",   maxConsecutiveWeeks: 2 },
      { initials: "WL", abbreviation: "ROPH",   maxConsecutiveWeeks: 2 },
      { initials: "DPG", abbreviation: "LTAC",  maxConsecutiveWeeks: 2 },
    ];

    let seeded = 0;
    for (const rule of knownRules) {
      const physician = await ctx.db
        .query("physicians")
        .withIndex("by_initials", (q) => q.eq("initials", rule.initials))
        .first();
      if (!physician) continue;

      const rotation = await ctx.db
        .query("rotations")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", args.fiscalYearId))
        .filter((q) => q.eq(q.field("abbreviation"), rule.abbreviation))
        .first();
      if (!rotation) continue;

      const existing = await ctx.db
        .query("physicianRotationRules")
        .withIndex("by_physician_rotation_fy", (q) =>
          q
            .eq("physicianId", physician._id)
            .eq("rotationId", rotation._id)
            .eq("fiscalYearId", args.fiscalYearId),
        )
        .first();

      if (!existing) {
        await ctx.db.insert("physicianRotationRules", {
          physicianId: physician._id,
          rotationId: rotation._id,
          fiscalYearId: args.fiscalYearId,
          maxConsecutiveWeeks: rule.maxConsecutiveWeeks,
        });
        seeded++;
      }
    }

    return { message: `Seeded ${seeded} physician-rotation rules`, seeded };
  },
});
