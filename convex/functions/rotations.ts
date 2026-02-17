import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "../lib/auth";

async function getCurrentFiscalYearForAdmin(ctx: any) {
  const physician = await requireAdmin(ctx);

  const collecting = await ctx.db
    .query("fiscalYears")
    .withIndex("by_status", (q: any) => q.eq("status", "collecting"))
    .first();
  if (collecting) return { physician, fiscalYear: collecting };

  const setup = await ctx.db
    .query("fiscalYears")
    .withIndex("by_status", (q: any) => q.eq("status", "setup"))
    .first();
  if (setup) return { physician, fiscalYear: setup };

  const building = await ctx.db
    .query("fiscalYears")
    .withIndex("by_status", (q: any) => q.eq("status", "building"))
    .first();
  if (building) return { physician, fiscalYear: building };

  const published = await ctx.db
    .query("fiscalYears")
    .withIndex("by_status", (q: any) => q.eq("status", "published"))
    .first();
  if (published) return { physician, fiscalYear: published };

  return { physician, fiscalYear: null };
}

export const getCurrentFiscalYearRotations = query({
  args: {},
  handler: async (ctx) => {
    const { fiscalYear } = await getCurrentFiscalYearForAdmin(ctx);
    if (!fiscalYear) {
      return { fiscalYear: null, rotations: [] };
    }

    const rotations = await ctx.db
      .query("rotations")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
      .collect();

    rotations.sort((a, b) => a.sortOrder - b.sortOrder);

    return { fiscalYear, rotations };
  },
});

export const createRotation = mutation({
  args: {
    name: v.string(),
    abbreviation: v.string(),
    cftePerWeek: v.number(),
    minStaff: v.number(),
    maxConsecutiveWeeks: v.number(),
  },
  handler: async (ctx, args) => {
    const { fiscalYear } = await getCurrentFiscalYearForAdmin(ctx);
    if (!fiscalYear) throw new Error("No active fiscal year available");

    const existing = await ctx.db
      .query("rotations")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
      .collect();

    const duplicate = existing.find(
      (rotation) =>
        rotation.name.trim().toLowerCase() === args.name.trim().toLowerCase() ||
        rotation.abbreviation.trim().toLowerCase() === args.abbreviation.trim().toLowerCase(),
    );

    if (duplicate) {
      throw new Error("Rotation name or abbreviation already exists for this fiscal year");
    }

    const nextSortOrder = existing.length > 0 ? Math.max(...existing.map((r) => r.sortOrder)) + 1 : 1;

    await ctx.db.insert("rotations", {
      fiscalYearId: fiscalYear._id,
      name: args.name.trim(),
      abbreviation: args.abbreviation.trim().toUpperCase(),
      cftePerWeek: args.cftePerWeek,
      minStaff: args.minStaff,
      maxConsecutiveWeeks: args.maxConsecutiveWeeks,
      sortOrder: nextSortOrder,
      isActive: true,
    });

    return { message: "Rotation created" };
  },
});

export const setRotationActive = mutation({
  args: {
    rotationId: v.id("rotations"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const rotation = await ctx.db.get(args.rotationId);
    if (!rotation) throw new Error("Rotation not found");

    await ctx.db.patch(rotation._id, { isActive: args.isActive });
    return { message: args.isActive ? "Rotation activated" : "Rotation deactivated" };
  },
});
