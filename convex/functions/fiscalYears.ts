import { query, mutation, MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireAuthenticatedUser } from "../lib/auth";
import { canTransitionFiscalYearStatus, FiscalYearStatus } from "../lib/workflowPolicy";
import {
  ACTIVE_FISCAL_YEAR_STATUSES,
  ensureCanActivateFiscalYear,
  ensureNoActiveFiscalYear,
  getSingleActiveFiscalYear,
  parseRequestDeadlineMs,
} from "../lib/fiscalYear";
import { publishDraftCalendarForFiscalYear } from "../lib/masterCalendarPublish";
import {
  INSTITUTIONAL_CONFERENCE_NAMES,
  normalizeInstitutionalConferenceName,
} from "../lib/calendarEvents";
import { Id } from "../_generated/dataModel";

const fiscalYearStatusValidator = v.union(
  v.literal("setup"),
  v.literal("collecting"),
  v.literal("building"),
  v.literal("published"),
  v.literal("archived"),
);

type FiscalWeekSeedRecord = {
  _id: Id<"weeks">;
  weekNumber: number;
  startDate: string;
  endDate: string;
};

async function seedInstitutionalConferencePlaceholders(params: {
  ctx: MutationCtx;
  fiscalYearId: Id<"fiscalYears">;
  weeks: FiscalWeekSeedRecord[];
  addedBy: string;
}) {
  if (params.weeks.length === 0) return { insertedCount: 0 };

  const existingEvents = await params.ctx.db
    .query("calendarEvents")
    .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", params.fiscalYearId))
    .collect();

  const existingConferenceNames = new Set<string>();
  for (const event of existingEvents) {
    if (event.category !== "conference") continue;
    const normalized = normalizeInstitutionalConferenceName(event.name);
    if (!normalized) continue;
    existingConferenceNames.add(normalized);
  }

  const firstWeek = [...params.weeks].sort((a, b) => a.weekNumber - b.weekNumber)[0];
  let insertedCount = 0;
  for (const conferenceName of INSTITUTIONAL_CONFERENCE_NAMES) {
    if (existingConferenceNames.has(conferenceName)) continue;

    await params.ctx.db.insert("calendarEvents", {
      fiscalYearId: params.fiscalYearId,
      weekId: firstWeek._id,
      date: firstWeek.startDate,
      name: conferenceName,
      category: "conference",
      source: "admin_manual",
      isApproved: true,
      isVisible: false,
      addedBy: params.addedBy,
    });
    insertedCount += 1;
  }

  return { insertedCount };
}

export const getFiscalYears = query({
  args: {},
  returns: v.array(
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
      previousFiscalYearId: v.optional(v.id("fiscalYears")),
    }),
  ),
  handler: async (ctx) => {
    await requireAuthenticatedUser(ctx);
    return await ctx.db.query("fiscalYears").collect();
  },
});

export const getCurrentFiscalYear = query({
  args: {},
  returns: v.union(
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
      previousFiscalYearId: v.optional(v.id("fiscalYears")),
    }),
  ),
  handler: async (ctx) => {
    await requireAuthenticatedUser(ctx);
    return await getSingleActiveFiscalYear(ctx);
  },
});

export const getWeeksByFiscalYear = query({
  args: { fiscalYearId: v.id("fiscalYears") },
  returns: v.array(
    v.object({
      _id: v.id("weeks"),
      fiscalYearId: v.id("fiscalYears"),
      weekNumber: v.number(),
      startDate: v.string(),
      endDate: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const weeks = await ctx.db
      .query("weeks")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", args.fiscalYearId))
      .collect();
    weeks.sort((a, b) => a.weekNumber - b.weekNumber);
    return weeks;
  },
});

export const createFiscalYear = mutation({
  args: {
    label: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  },
  returns: v.id("fiscalYears"),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const label = args.label.trim().toUpperCase();
    if (!label) throw new Error("Fiscal year label is required");

    const existingLabel = await ctx.db
      .query("fiscalYears")
      .withIndex("by_label", (q) => q.eq("label", label))
      .collect();
    if (existingLabel.length > 0) {
      throw new Error(`Fiscal year label ${label} already exists`);
    }

    await ensureNoActiveFiscalYear(ctx);

    const fiscalYearId = await ctx.db.insert("fiscalYears", {
      ...args,
      label,
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

    const insertedWeeks: FiscalWeekSeedRecord[] = [];
    for (const week of weeks) {
      const weekId = await ctx.db.insert("weeks", week);
      insertedWeeks.push({
        _id: weekId,
        weekNumber: week.weekNumber,
        startDate: week.startDate,
        endDate: week.endDate,
      });
    }

    await seedInstitutionalConferencePlaceholders({
      ctx,
      fiscalYearId,
      weeks: insertedWeeks,
      addedBy: admin.actorId,
    });

    return fiscalYearId;
  },
});

export const getWeeks = query({
  args: { fiscalYearId: v.id("fiscalYears") },
  returns: v.array(
    v.object({
      _id: v.id("weeks"),
      _creationTime: v.number(),
      fiscalYearId: v.id("fiscalYears"),
      weekNumber: v.number(),
      startDate: v.string(),
      endDate: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    return await ctx.db
      .query("weeks")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", args.fiscalYearId))
      .collect();
  },
});

export const seedFY27 = mutation({
  args: {},
  returns: v.object({ message: v.string() }),
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);

    // Check if FY27 already exists
    const existingByLabel = await ctx.db
      .query("fiscalYears")
      .withIndex("by_label", (q) => q.eq("label", "FY27"))
      .collect();
    if (existingByLabel.length > 0) return { message: "FY27 already exists" };

    await ensureNoActiveFiscalYear(ctx);

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

    const insertedWeeks: FiscalWeekSeedRecord[] = [];
    for (const week of FY27_WEEKS) {
      const weekId = await ctx.db.insert("weeks", {
        fiscalYearId,
        weekNumber: week.wk,
        startDate: week.start,
        endDate: week.end,
      });
      insertedWeeks.push({
        _id: weekId,
        weekNumber: week.wk,
        startDate: week.start,
        endDate: week.end,
      });
    }

    const conferenceSeed = await seedInstitutionalConferencePlaceholders({
      ctx,
      fiscalYearId,
      weeks: insertedWeeks,
      addedBy: admin.actorId,
    });

    return {
      message: `FY27 created with 52 weeks and ${conferenceSeed.insertedCount} conference placeholder(s)`,
    };
  },
});

export const updateFiscalYearStatus = mutation({
  args: {
    fiscalYearId: v.id("fiscalYears"),
    status: fiscalYearStatusValidator,
  },
  returns: v.union(
    v.object({ message: v.string() }),
    v.object({
      message: v.string(),
      calendarId: v.id("masterCalendars"),
      publishedAt: v.number(),
      publishedBy: v.union(v.null(), v.id("physicians")),
    }),
  ),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const fiscalYear = await ctx.db.get(args.fiscalYearId);
    if (!fiscalYear) throw new Error("Fiscal year not found");
    if (fiscalYear.status === args.status) {
      return { message: `${fiscalYear.label} is already ${args.status}` };
    }

    if (
      !canTransitionFiscalYearStatus(
        fiscalYear.status as FiscalYearStatus,
        args.status as FiscalYearStatus,
      )
    ) {
      throw new Error(`Invalid transition: ${fiscalYear.status} -> ${args.status}`);
    }

    if (ACTIVE_FISCAL_YEAR_STATUSES.includes(args.status as any)) {
      await ensureCanActivateFiscalYear(ctx, fiscalYear._id);
    }

    if (args.status === "published") {
      return await publishDraftCalendarForFiscalYear({
        ctx,
        fiscalYear,
        adminId: admin.actorPhysicianId,
      });
    }

    await ctx.db.patch(fiscalYear._id, { status: args.status });
    return { message: `${fiscalYear.label} moved to ${args.status}` };
  },
});

export const setPreviousFiscalYear = mutation({
  args: {
    fiscalYearId: v.id("fiscalYears"),
    previousFiscalYearId: v.optional(v.id("fiscalYears")),
  },
  returns: v.object({ message: v.string() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const fiscalYear = await ctx.db.get(args.fiscalYearId);
    if (!fiscalYear) throw new Error("Fiscal year not found");

    if (args.previousFiscalYearId) {
      if (args.previousFiscalYearId === args.fiscalYearId) {
        throw new Error("A fiscal year cannot reference itself as its prior year");
      }
      const priorFy = await ctx.db.get(args.previousFiscalYearId);
      if (!priorFy) throw new Error("Previous fiscal year not found");
    }

    await ctx.db.patch(args.fiscalYearId, {
      previousFiscalYearId: args.previousFiscalYearId,
    });

    return {
      message: args.previousFiscalYearId
        ? `Prior fiscal year linked for ${fiscalYear.label}`
        : `Prior fiscal year cleared for ${fiscalYear.label}`,
    };
  },
});

export const setFiscalYearRequestDeadline = mutation({
  args: {
    fiscalYearId: v.id("fiscalYears"),
    requestDeadline: v.optional(v.string()),
  },
  returns: v.object({ message: v.string() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const fiscalYear = await ctx.db.get(args.fiscalYearId);
    if (!fiscalYear) throw new Error("Fiscal year not found");

    if (args.requestDeadline) {
      parseRequestDeadlineMs({ requestDeadline: args.requestDeadline });
    }

    await ctx.db.patch(fiscalYear._id, {
      requestDeadline: args.requestDeadline,
    });

    return {
      message: args.requestDeadline
        ? `Request deadline set for ${fiscalYear.label}`
        : `Request deadline cleared for ${fiscalYear.label}`,
    };
  },
});
