import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentPhysician, requireAdmin } from "../lib/auth";

export const getFiscalYears = query({
  args: {},
  handler: async (ctx) => {
    await getCurrentPhysician(ctx);
    return await ctx.db.query("fiscalYears").collect();
  },
});

export const getCurrentFiscalYear = query({
  args: {},
  handler: async (ctx) => {
    await getCurrentPhysician(ctx);
    return await ctx.db
      .query("fiscalYears")
      .withIndex("by_status", (q) => q.eq("status", "collecting"))
      .first() ||
      await ctx.db
        .query("fiscalYears")
        .withIndex("by_status", (q) => q.eq("status", "setup"))
        .first() ||
      await ctx.db
        .query("fiscalYears")
        .withIndex("by_status", (q) => q.eq("status", "building"))
        .first() ||
      await ctx.db
        .query("fiscalYears")
        .withIndex("by_status", (q) => q.eq("status", "published"))
        .first();
  },
});

export const createFiscalYear = mutation({
  args: {
    label: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const fiscalYearId = await ctx.db.insert("fiscalYears", {
      ...args,
      status: "setup",
    });

    // Generate 52 weeks
    const startDate = new Date(args.startDate);
    const weeks = [];
    
    for (let i = 0; i < 52; i++) {
      const weekStart = new Date(startDate);
      weekStart.setDate(startDate.getDate() + (i * 7));
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      
      weeks.push({
        fiscalYearId,
        weekNumber: i + 1,
        startDate: weekStart.toISOString().split('T')[0],
        endDate: weekEnd.toISOString().split('T')[0],
      });
    }

    for (const week of weeks) {
      await ctx.db.insert("weeks", week);
    }

    return fiscalYearId;
  },
});

export const getWeeks = query({
  args: { fiscalYearId: v.id("fiscalYears") },
  handler: async (ctx, args) => {
    await getCurrentPhysician(ctx);
    return await ctx.db
      .query("weeks")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", args.fiscalYearId))
      .collect();
  },
});

export const seedFY27 = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    
    // Check if FY27 already exists
    const existing = (await ctx.db.query("fiscalYears").collect()).find(
      (fy) => fy.label === "FY27",
    );
    
    if (existing) return { message: "FY27 already exists" };

    const fiscalYearId = await ctx.db.insert("fiscalYears", {
      label: "FY27",
      startDate: "2026-06-29",
      endDate: "2027-06-27",
      status: "setup",
    });

    // FY27 weeks from the spec
    const FY27_WEEKS = [
      { wk:  1, start: "2026-06-29", end: "2026-07-05" },
      { wk:  2, start: "2026-07-06", end: "2026-07-12" },
      { wk:  3, start: "2026-07-13", end: "2026-07-19" },
      { wk:  4, start: "2026-07-20", end: "2026-07-26" },
      { wk:  5, start: "2026-07-27", end: "2026-08-02" },
      { wk:  6, start: "2026-08-03", end: "2026-08-09" },
      { wk:  7, start: "2026-08-10", end: "2026-08-16" },
      { wk:  8, start: "2026-08-17", end: "2026-08-23" },
      { wk:  9, start: "2026-08-24", end: "2026-08-30" },
      { wk: 10, start: "2026-08-31", end: "2026-09-06" },
      { wk: 11, start: "2026-09-07", end: "2026-09-13" },
      { wk: 12, start: "2026-09-14", end: "2026-09-20" },
      { wk: 13, start: "2026-09-21", end: "2026-09-27" },
      { wk: 14, start: "2026-09-28", end: "2026-10-04" },
      { wk: 15, start: "2026-10-05", end: "2026-10-11" },
      { wk: 16, start: "2026-10-12", end: "2026-10-18" },
      { wk: 17, start: "2026-10-19", end: "2026-10-25" },
      { wk: 18, start: "2026-10-26", end: "2026-11-01" },
      { wk: 19, start: "2026-11-02", end: "2026-11-08" },
      { wk: 20, start: "2026-11-09", end: "2026-11-15" },
      { wk: 21, start: "2026-11-16", end: "2026-11-22" },
      { wk: 22, start: "2026-11-23", end: "2026-11-29" },
      { wk: 23, start: "2026-11-30", end: "2026-12-06" },
      { wk: 24, start: "2026-12-07", end: "2026-12-13" },
      { wk: 25, start: "2026-12-14", end: "2026-12-20" },
      { wk: 26, start: "2026-12-21", end: "2026-12-27" },
      { wk: 27, start: "2026-12-28", end: "2027-01-03" },
      { wk: 28, start: "2027-01-04", end: "2027-01-10" },
      { wk: 29, start: "2027-01-11", end: "2027-01-17" },
      { wk: 30, start: "2027-01-18", end: "2027-01-24" },
      { wk: 31, start: "2027-01-25", end: "2027-01-31" },
      { wk: 32, start: "2027-02-01", end: "2027-02-07" },
      { wk: 33, start: "2027-02-08", end: "2027-02-14" },
      { wk: 34, start: "2027-02-15", end: "2027-02-21" },
      { wk: 35, start: "2027-02-22", end: "2027-02-28" },
      { wk: 36, start: "2027-03-01", end: "2027-03-07" },
      { wk: 37, start: "2027-03-08", end: "2027-03-14" },
      { wk: 38, start: "2027-03-15", end: "2027-03-21" },
      { wk: 39, start: "2027-03-22", end: "2027-03-28" },
      { wk: 40, start: "2027-03-29", end: "2027-04-04" },
      { wk: 41, start: "2027-04-05", end: "2027-04-11" },
      { wk: 42, start: "2027-04-12", end: "2027-04-18" },
      { wk: 43, start: "2027-04-19", end: "2027-04-25" },
      { wk: 44, start: "2027-04-26", end: "2027-05-02" },
      { wk: 45, start: "2027-05-03", end: "2027-05-09" },
      { wk: 46, start: "2027-05-10", end: "2027-05-16" },
      { wk: 47, start: "2027-05-17", end: "2027-05-23" },
      { wk: 48, start: "2027-05-24", end: "2027-05-30" },
      { wk: 49, start: "2027-05-31", end: "2027-06-06" },
      { wk: 50, start: "2027-06-07", end: "2027-06-13" },
      { wk: 51, start: "2027-06-14", end: "2027-06-20" },
      { wk: 52, start: "2027-06-21", end: "2027-06-27" },
    ];

    for (const week of FY27_WEEKS) {
      await ctx.db.insert("weeks", {
        fiscalYearId,
        weekNumber: week.wk,
        startDate: week.start,
        endDate: week.end,
      });
    }

    return { message: "FY27 created with 52 weeks" };
  },
});
