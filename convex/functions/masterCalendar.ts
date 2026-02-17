import { mutation, query } from "../_generated/server";
import { requireAdmin } from "../lib/auth";
import { getNextMasterCalendarVersion } from "../lib/masterCalendar";
import { getSingleActiveFiscalYear } from "../lib/fiscalYear";

async function getCurrentFiscalYearForAdmin(ctx: any) {
  await requireAdmin(ctx);
  return await getSingleActiveFiscalYear(ctx);
}

export const getCurrentFiscalYearMasterCalendarDraft = query({
  args: {},
  handler: async (ctx) => {
    const fiscalYear = await getCurrentFiscalYearForAdmin(ctx);
    if (!fiscalYear) {
      return { fiscalYear: null, calendar: null, rotations: [], weeks: [], grid: [] };
    }

    const [weeks, rotations, calendars] = await Promise.all([
      ctx.db
        .query("weeks")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
      ctx.db
        .query("rotations")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
      ctx.db
        .query("masterCalendars")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
    ]);

    weeks.sort((a, b) => a.weekNumber - b.weekNumber);
    const activeRotations = rotations
      .filter((rotation) => rotation.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const draftCalendar =
      calendars
        .filter((calendar) => calendar.status === "draft")
        .sort((a, b) => b.version - a.version)[0] ?? null;

    if (!draftCalendar) {
      return { fiscalYear, calendar: null, rotations: activeRotations, weeks, grid: [] };
    }

    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_calendar", (q) => q.eq("masterCalendarId", draftCalendar._id))
      .collect();

    const assignmentByKey = new Map(
      assignments.map((assignment) => [
        `${String(assignment.weekId)}:${String(assignment.rotationId)}`,
        assignment,
      ]),
    );

    const grid = weeks.map((week) => ({
      weekId: week._id,
      weekNumber: week.weekNumber,
      startDate: week.startDate,
      endDate: week.endDate,
      cells: activeRotations.map((rotation) => {
        const assignment = assignmentByKey.get(`${String(week._id)}:${String(rotation._id)}`);
        return {
          rotationId: rotation._id,
          assignmentId: assignment?._id ?? null,
          physicianId: assignment?.physicianId ?? null,
        };
      }),
    }));

    return { fiscalYear, calendar: draftCalendar, rotations: activeRotations, weeks, grid };
  },
});

export const createCurrentFiscalYearMasterCalendarDraft = mutation({
  args: {},
  handler: async (ctx) => {
    const fiscalYear = await getCurrentFiscalYearForAdmin(ctx);
    if (!fiscalYear) throw new Error("No active fiscal year available");

    const [weeks, rotations, calendars] = await Promise.all([
      ctx.db
        .query("weeks")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
      ctx.db
        .query("rotations")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
      ctx.db
        .query("masterCalendars")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
    ]);

    const existingDraft = calendars
      .filter((calendar) => calendar.status === "draft")
      .sort((a, b) => b.version - a.version)[0];
    if (existingDraft) {
      return { message: "Draft already exists", calendarId: existingDraft._id };
    }

    const version = getNextMasterCalendarVersion(calendars.map((calendar) => calendar.version));
    const calendarId = await ctx.db.insert("masterCalendars", {
      fiscalYearId: fiscalYear._id,
      version,
      status: "draft",
    });

    const activeRotations = rotations.filter((rotation) => rotation.isActive);
    for (const week of weeks) {
      for (const rotation of activeRotations) {
        await ctx.db.insert("assignments", {
          masterCalendarId: calendarId,
          weekId: week._id,
          rotationId: rotation._id,
          physicianId: undefined,
          assignedBy: undefined,
          assignedAt: undefined,
        });
      }
    }

    return { message: "Master calendar draft created", calendarId };
  },
});
