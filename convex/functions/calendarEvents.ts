import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentPhysician, requireAdmin } from "../lib/auth";
import { getSingleActiveFiscalYear } from "../lib/fiscalYear";

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

export const getCurrentFiscalYearCalendarEvents = query({
  args: {},
  handler: async (ctx) => {
    const physician = await getCurrentPhysician(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) {
      return { fiscalYear: null, events: [] };
    }

    let events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_fiscalYear_date", (q) => q.eq("fiscalYearId", fiscalYear._id))
      .collect();

    if (physician.role !== "admin") {
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
      addedBy: String(admin._id),
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
