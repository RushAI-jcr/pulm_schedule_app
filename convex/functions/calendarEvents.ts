import { action, internalMutation, mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { requireAdmin, requireAuthenticatedUser } from "../lib/auth";
import { getSingleActiveFiscalYear } from "../lib/fiscalYear";
import {
  buildHolidayEventKey,
  CalendarificHoliday,
  findFiscalWeekForDate,
  getCalendarYearsInDateRange,
  INSTITUTIONAL_CONFERENCE_NAMES,
  InstitutionalConferenceName,
  mapCalendarificReligiousObservancesToFiscalWeeks,
  mapUsPublicHolidaysToFiscalWeeks,
  NagerPublicHoliday,
  normalizeInstitutionalConferenceName,
} from "../lib/calendarEvents";

const eventCategoryValidator = v.union(
  v.literal("federal_holiday"),
  v.literal("religious_observance"),
  v.literal("cultural_observance"),
  v.literal("conference"),
  v.literal("other"),
);

const eventSourceValidator = v.union(
  v.literal("nager_api"),
  v.literal("calendarific"),
  v.literal("admin_manual"),
);
const institutionalConferenceNameValidator = v.union(
  v.literal("CHEST"),
  v.literal("SCCM"),
  v.literal("ATS"),
);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const NAGER_DATE_US_PUBLIC_HOLIDAYS_URL = "https://date.nager.at/api/v3/PublicHolidays";
const CALENDARIFIC_HOLIDAYS_URL = "https://calendarific.com/api/v2/holidays";
const CALENDARIFIC_COUNTRY_CODE = "US";
const getLoggedInUserRef = makeFunctionReference<"query">("auth:loggedInUser");
const getCurrentFiscalYearRef = makeFunctionReference<"query">(
  "functions/fiscalYears:getCurrentFiscalYear",
);
const getWeeksRef = makeFunctionReference<"query">("functions/fiscalYears:getWeeks");
const getCurrentFiscalYearCalendarEventsRef = makeFunctionReference<"query">(
  "functions/calendarEvents:getCurrentFiscalYearCalendarEvents",
);
type ActionUserProfile = {
  role: string;
  physicianId: string | null;
};

type ExistingCalendarEvent = {
  _id: Id<"calendarEvents">;
  source: string;
  category: string;
  weekId: Id<"weeks">;
  date: string;
  name: string;
};

function parseCalendarificPayload(payload: unknown, year: number): CalendarificHoliday[] {
  if (!payload || typeof payload !== "object") {
    throw new Error(`Unexpected Calendarific response format for ${year}`);
  }

  const metaCode = (payload as { meta?: { code?: number } }).meta?.code;
  if (typeof metaCode === "number" && metaCode !== 200) {
    throw new Error(`Calendarific request failed for ${year} (API code ${metaCode})`);
  }

  const holidays = (payload as { response?: { holidays?: CalendarificHoliday[] } }).response?.holidays;
  if (!Array.isArray(holidays)) {
    throw new Error(`Unexpected Calendarific response format for ${year}`);
  }

  return holidays;
}

export const getCurrentFiscalYearCalendarEvents = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const currentUser = await requireAuthenticatedUser(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) {
      return { fiscalYear: null, events: [] };
    }

    let events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_fiscalYear_date", (q) => q.eq("fiscalYearId", fiscalYear._id))
      .collect();

    if (currentUser.role !== "admin") {
      events = events.filter((event) => event.isApproved && event.isVisible);
    }

    events.sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      return a.name.localeCompare(b.name);
    });

    return { fiscalYear, events };
  },
});

export const createCalendarEvent = mutation({
  args: {
    weekId: v.id("weeks"),
    date: v.string(),
    name: v.string(),
    category: eventCategoryValidator,
    source: v.optional(eventSourceValidator),
    isApproved: v.optional(v.boolean()),
    isVisible: v.optional(v.boolean()),
  },
  returns: v.object({ message: v.string() }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) throw new Error("No active fiscal year available");

    const week = await ctx.db.get(args.weekId);
    if (!week || week.fiscalYearId !== fiscalYear._id) {
      throw new Error("Week does not belong to the current fiscal year");
    }

    const name = args.name.trim();
    if (!name) throw new Error("Event name is required");

    const source = args.source ?? "admin_manual";
    const isApproved = args.isApproved ?? source === "admin_manual";
    const isVisible = args.isVisible ?? true;

    await ctx.db.insert("calendarEvents", {
      fiscalYearId: fiscalYear._id,
      weekId: args.weekId,
      date: args.date,
      name,
      category: args.category,
      source,
      isApproved,
      isVisible,
      addedBy: admin.actorId,
    });

    return { message: "Calendar event created" };
  },
});

export const updateCalendarEvent = mutation({
  args: {
    eventId: v.id("calendarEvents"),
    weekId: v.optional(v.id("weeks")),
    date: v.optional(v.string()),
    name: v.optional(v.string()),
    category: v.optional(eventCategoryValidator),
    source: v.optional(eventSourceValidator),
    isApproved: v.optional(v.boolean()),
    isVisible: v.optional(v.boolean()),
  },
  returns: v.object({ message: v.string() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) throw new Error("No active fiscal year available");

    const event = await ctx.db.get(args.eventId);
    if (!event || event.fiscalYearId !== fiscalYear._id) {
      throw new Error("Calendar event not found");
    }

    if (args.weekId) {
      const week = await ctx.db.get(args.weekId);
      if (!week || week.fiscalYearId !== fiscalYear._id) {
        throw new Error("Week does not belong to the current fiscal year");
      }
    }

    const normalizedName = args.name?.trim();
    if (args.name !== undefined && !normalizedName) {
      throw new Error("Event name is required");
    }

    await ctx.db.patch(event._id, {
      ...(args.weekId ? { weekId: args.weekId } : {}),
      ...(args.date ? { date: args.date } : {}),
      ...(normalizedName ? { name: normalizedName } : {}),
      ...(args.category ? { category: args.category } : {}),
      ...(args.source ? { source: args.source } : {}),
      ...(args.isApproved !== undefined ? { isApproved: args.isApproved } : {}),
      ...(args.isVisible !== undefined ? { isVisible: args.isVisible } : {}),
    });

    return { message: "Calendar event updated" };
  },
});

export const deleteCalendarEvent = mutation({
  args: { eventId: v.id("calendarEvents") },
  returns: v.object({ message: v.string() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) throw new Error("No active fiscal year available");

    const event = await ctx.db.get(args.eventId);
    if (!event || event.fiscalYearId !== fiscalYear._id) {
      throw new Error("Calendar event not found");
    }

    await ctx.db.delete(event._id);
    return { message: "Calendar event deleted" };
  },
});

export const getCurrentFiscalYearInstitutionalConferences = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) {
      return { fiscalYear: null, conferences: [] };
    }

    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
      .collect();

    const primaryEventByName = new Map<
      InstitutionalConferenceName,
      typeof events[number]
    >();
    for (const event of events) {
      if (event.category !== "conference") continue;
      const normalized = normalizeInstitutionalConferenceName(event.name);
      if (!normalized) continue;
      const existing = primaryEventByName.get(normalized);
      if (!existing || event._creationTime < existing._creationTime) {
        primaryEventByName.set(normalized, event);
      }
    }

    return {
      fiscalYear,
      conferences: INSTITUTIONAL_CONFERENCE_NAMES.map((name) => {
        const event = primaryEventByName.get(name) ?? null;
        return {
          name,
          eventId: event?._id ?? null,
          date: event?.isVisible ? event.date : null,
          weekId: event?.isVisible ? event.weekId : null,
          isVisible: event?.isVisible ?? false,
        };
      }),
    };
  },
});

export const setCurrentFiscalYearInstitutionalConferenceDate = mutation({
  args: {
    conferenceName: institutionalConferenceNameValidator,
    date: v.string(),
    isVisible: v.optional(v.boolean()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) throw new Error("No active fiscal year available");
    if (!ISO_DATE_PATTERN.test(args.date)) {
      throw new Error("Conference date must be in ISO date format (YYYY-MM-DD)");
    }
    if (args.date < fiscalYear.startDate || args.date > fiscalYear.endDate) {
      throw new Error(
        `Conference date ${args.date} must fall within ${fiscalYear.label} (${fiscalYear.startDate} to ${fiscalYear.endDate})`,
      );
    }

    const weeks = await ctx.db
      .query("weeks")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
      .collect();
    const targetWeek = findFiscalWeekForDate(weeks, args.date);
    if (!targetWeek) {
      throw new Error(`Could not map ${args.date} to a fiscal week for ${fiscalYear.label}`);
    }

    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
      .collect();
    const matches = events
      .filter((event) => event.category === "conference")
      .filter((event) => normalizeInstitutionalConferenceName(event.name) === args.conferenceName)
      .sort((a, b) => a._creationTime - b._creationTime);

    const isVisible = args.isVisible ?? true;

    if (matches.length === 0) {
      await ctx.db.insert("calendarEvents", {
        fiscalYearId: fiscalYear._id,
        weekId: targetWeek._id,
        date: args.date,
        name: args.conferenceName,
        category: "conference",
        source: "admin_manual",
        isApproved: true,
        isVisible,
        addedBy: admin.actorId,
      });
    } else {
      const primary = matches[0];
      await ctx.db.patch(primary._id, {
        weekId: targetWeek._id,
        date: args.date,
        name: args.conferenceName,
        source: "admin_manual",
        isApproved: true,
        isVisible,
        addedBy: admin.actorId,
      });
      for (const duplicate of matches.slice(1)) {
        await ctx.db.delete(duplicate._id);
      }
    }

    return {
      message: `${args.conferenceName} saved for ${args.date} (Week ${targetWeek.weekNumber})`,
      conferenceName: args.conferenceName,
      date: args.date,
      weekNumber: targetWeek.weekNumber,
    };
  },
});

export const batchUpsertCalendarEvents = internalMutation({
  args: {
    creates: v.array(
      v.object({
        fiscalYearId: v.id("fiscalYears"),
        weekId: v.id("weeks"),
        date: v.string(),
        name: v.string(),
        category: eventCategoryValidator,
        source: eventSourceValidator,
        isApproved: v.boolean(),
        isVisible: v.boolean(),
      }),
    ),
    updates: v.array(
      v.object({
        eventId: v.id("calendarEvents"),
        weekId: v.id("weeks"),
      }),
    ),
  },
  returns: v.object({
    insertedCount: v.number(),
    updatedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    for (const create of args.creates) {
      await ctx.db.insert("calendarEvents", create);
    }
    for (const update of args.updates) {
      await ctx.db.patch(update.eventId, { weekId: update.weekId });
    }
    return {
      insertedCount: args.creates.length,
      updatedCount: args.updates.length,
    };
  },
});

export const importCurrentFiscalYearUsPublicHolidays = action({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userProfile = (await ctx.runQuery(getLoggedInUserRef, {})) as ActionUserProfile | null;
    if (!userProfile || userProfile.role !== "admin") {
      throw new Error("Admin access required");
    }

    const fiscalYear = await ctx.runQuery(getCurrentFiscalYearRef, {});
    if (!fiscalYear) throw new Error("No active fiscal year available");

    const weeks = await ctx.runQuery(getWeeksRef, {
      fiscalYearId: fiscalYear._id,
    });
    if (weeks.length === 0) {
      throw new Error("Current fiscal year has no configured weeks");
    }

    const years = getCalendarYearsInDateRange(fiscalYear.startDate, fiscalYear.endDate);
    const responses = await Promise.all(
      years.map(async (year) => {
        const response = await fetch(`${NAGER_DATE_US_PUBLIC_HOLIDAYS_URL}/${year}/US`, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`Nager.Date request failed for ${year} (HTTP ${response.status})`);
        }
        const payload = (await response.json()) as unknown;
        if (!Array.isArray(payload)) {
          throw new Error(`Unexpected Nager.Date response format for ${year}`);
        }
        return payload as NagerPublicHoliday[];
      }),
    );

    const rawHolidayCount = responses.reduce((sum, payload) => sum + payload.length, 0);
    const mappedHolidays = mapUsPublicHolidaysToFiscalWeeks({
      fiscalYearStartDate: fiscalYear.startDate,
      fiscalYearEndDate: fiscalYear.endDate,
      weeks,
      holidays: responses.flat(),
    });

    const existingBundle = (await ctx.runQuery(getCurrentFiscalYearCalendarEventsRef, {})) as {
      events: ExistingCalendarEvent[];
    };
    const existingByKey = new Map<
      string,
      { _id?: Id<"calendarEvents">; weekId: Id<"weeks"> }
    >();
    for (const event of existingBundle.events) {
      if (event.source !== "nager_api" || event.category !== "federal_holiday") continue;
      const key = buildHolidayEventKey(event.date, event.name);
      if (!existingByKey.has(key)) {
        existingByKey.set(key, { _id: event._id, weekId: event.weekId });
      }
    }

    const creates: Array<{
      fiscalYearId: Id<"fiscalYears">;
      weekId: Id<"weeks">;
      date: string;
      name: string;
      category: "federal_holiday";
      source: "nager_api";
      isApproved: boolean;
      isVisible: boolean;
    }> = [];
    const updates: Array<{
      eventId: Id<"calendarEvents">;
      weekId: Id<"weeks">;
    }> = [];
    let skippedExistingCount = 0;

    for (const holiday of mappedHolidays) {
      const key = buildHolidayEventKey(holiday.date, holiday.name);
      const existing = existingByKey.get(key);
      if (existing) {
        if (existing._id && String(existing.weekId) !== String(holiday.weekId)) {
          updates.push({
            eventId: existing._id,
            weekId: holiday.weekId as Id<"weeks">,
          });
        } else {
          skippedExistingCount += 1;
        }
        continue;
      }

      creates.push({
        fiscalYearId: fiscalYear._id as Id<"fiscalYears">,
        weekId: holiday.weekId as Id<"weeks">,
        date: holiday.date,
        name: holiday.name,
        category: "federal_holiday",
        source: "nager_api",
        isApproved: false,
        isVisible: true,
      });
    }

    if (creates.length > 0 || updates.length > 0) {
      await ctx.runMutation(
        internal.functions.calendarEvents.batchUpsertCalendarEvents,
        { creates, updates },
      );
    }

    return {
      message:
        creates.length > 0
          ? `Imported ${creates.length} US public holiday event(s) from Nager.Date`
          : updates.length > 0
            ? `Updated ${updates.length} imported holiday week mapping(s)`
            : "No new US public holidays to import",
      fiscalYearLabel: fiscalYear.label,
      yearsQueried: years,
      rawHolidayCount,
      mappedHolidayCount: mappedHolidays.length,
      insertedCount: creates.length,
      updatedCount: updates.length,
      skippedExistingCount,
    };
  },
});

export const importCurrentFiscalYearReligiousObservances = action({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userProfile = (await ctx.runQuery(getLoggedInUserRef, {})) as ActionUserProfile | null;
    if (!userProfile || userProfile.role !== "admin") {
      throw new Error("Admin access required");
    }

    const fiscalYear = await ctx.runQuery(getCurrentFiscalYearRef, {});
    if (!fiscalYear) throw new Error("No active fiscal year available");

    const weeks = await ctx.runQuery(getWeeksRef, {
      fiscalYearId: fiscalYear._id,
    });
    if (weeks.length === 0) {
      throw new Error("Current fiscal year has no configured weeks");
    }

    const apiKey = (process.env.CALENDARIFIC_API_KEY ?? "").trim();
    if (!apiKey) {
      throw new Error("CALENDARIFIC_API_KEY is not configured for this deployment");
    }

    const years = getCalendarYearsInDateRange(fiscalYear.startDate, fiscalYear.endDate);
    const responses = await Promise.all(
      years.map(async (year) => {
        const url = new URL(CALENDARIFIC_HOLIDAYS_URL);
        url.searchParams.set("api_key", apiKey);
        url.searchParams.set("country", CALENDARIFIC_COUNTRY_CODE);
        url.searchParams.set("year", String(year));
        url.searchParams.set("type", "religious");

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`Calendarific request failed for ${year} (HTTP ${response.status})`);
        }
        const payload = (await response.json()) as unknown;
        return { year, payload };
      }),
    );

    let rawHolidayCount = 0;
    const holidays: CalendarificHoliday[] = [];
    for (const { year, payload } of responses) {
      const parsed = parseCalendarificPayload(payload, year);
      rawHolidayCount += parsed.length;
      holidays.push(...parsed);
    }

    const mappedHolidays = mapCalendarificReligiousObservancesToFiscalWeeks({
      fiscalYearStartDate: fiscalYear.startDate,
      fiscalYearEndDate: fiscalYear.endDate,
      weeks,
      holidays,
    });

    const existingBundle = (await ctx.runQuery(getCurrentFiscalYearCalendarEventsRef, {})) as {
      events: ExistingCalendarEvent[];
    };
    const existingByKey = new Map<
      string,
      { _id?: Id<"calendarEvents">; weekId: Id<"weeks"> }
    >();
    for (const event of existingBundle.events) {
      if (event.source !== "calendarific" || event.category !== "religious_observance") continue;
      const key = buildHolidayEventKey(event.date, event.name);
      if (!existingByKey.has(key)) {
        existingByKey.set(key, { _id: event._id, weekId: event.weekId });
      }
    }

    const creates: Array<{
      fiscalYearId: Id<"fiscalYears">;
      weekId: Id<"weeks">;
      date: string;
      name: string;
      category: "religious_observance";
      source: "calendarific";
      isApproved: boolean;
      isVisible: boolean;
    }> = [];
    const updates: Array<{
      eventId: Id<"calendarEvents">;
      weekId: Id<"weeks">;
    }> = [];
    let skippedExistingCount = 0;

    for (const holiday of mappedHolidays) {
      const key = buildHolidayEventKey(holiday.date, holiday.name);
      const existing = existingByKey.get(key);
      if (existing) {
        if (existing._id && String(existing.weekId) !== String(holiday.weekId)) {
          updates.push({
            eventId: existing._id,
            weekId: holiday.weekId as Id<"weeks">,
          });
        } else {
          skippedExistingCount += 1;
        }
        continue;
      }

      creates.push({
        fiscalYearId: fiscalYear._id as Id<"fiscalYears">,
        weekId: holiday.weekId as Id<"weeks">,
        date: holiday.date,
        name: holiday.name,
        category: "religious_observance",
        source: "calendarific",
        isApproved: false,
        isVisible: true,
      });
    }

    if (creates.length > 0 || updates.length > 0) {
      await ctx.runMutation(
        internal.functions.calendarEvents.batchUpsertCalendarEvents,
        { creates, updates },
      );
    }

    return {
      message:
        creates.length > 0
          ? `Imported ${creates.length} religious observance(s) from Calendarific`
          : updates.length > 0
            ? `Updated ${updates.length} imported observance week mapping(s)`
            : "No new religious observances to import",
      fiscalYearLabel: fiscalYear.label,
      yearsQueried: years,
      rawHolidayCount,
      mappedHolidayCount: mappedHolidays.length,
      insertedCount: creates.length,
      updatedCount: updates.length,
      skippedExistingCount,
    };
  },
});
