import { query, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { requireAdmin } from "../lib/auth";
import { paginateByOffset } from "../lib/auditLog";

async function getCurrentFiscalYearForAdmin(ctx: QueryCtx) {
  await requireAdmin(ctx);

  const collecting = await ctx.db
    .query("fiscalYears")
    .withIndex("by_status", (q) => q.eq("status", "collecting"))
    .first();
  if (collecting) return collecting;

  const setup = await ctx.db
    .query("fiscalYears")
    .withIndex("by_status", (q) => q.eq("status", "setup"))
    .first();
  if (setup) return setup;

  const building = await ctx.db
    .query("fiscalYears")
    .withIndex("by_status", (q) => q.eq("status", "building"))
    .first();
  if (building) return building;

  return await ctx.db
    .query("fiscalYears")
    .withIndex("by_status", (q) => q.eq("status", "published"))
    .first();
}

export const getCurrentFiscalYearAuditLog = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    actionFilter: v.optional(v.string()),
    entityTypeFilter: v.optional(v.string()),
  },
  returns: v.object({
    fiscalYear: v.union(
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
      }),
    ),
    items: v.array(
      v.object({
        _id: v.id("auditLog"),
        _creationTime: v.number(),
        fiscalYearId: v.id("fiscalYears"),
        userId: v.id("physicians"),
        action: v.string(),
        entityType: v.string(),
        entityId: v.string(),
        before: v.optional(v.string()),
        after: v.optional(v.string()),
        timestamp: v.number(),
        userName: v.string(),
      }),
    ),
    nextCursor: v.union(v.string(), v.null()),
    totalCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const fiscalYear = await getCurrentFiscalYearForAdmin(ctx);
    if (!fiscalYear) {
      return { fiscalYear: null, items: [], nextCursor: null, totalCount: 0 };
    }

    const rawLimit = args.limit ?? 25;
    const limit = Math.max(1, Math.min(100, Math.floor(rawLimit)));
    const actionFilter = args.actionFilter?.trim().toLowerCase();
    const entityTypeFilter = args.entityTypeFilter?.trim().toLowerCase();

    let rows = await ctx.db
      .query("auditLog")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
      .collect();

    rows.sort((a, b) => b.timestamp - a.timestamp);

    if (actionFilter) {
      rows = rows.filter((row) => row.action.toLowerCase().includes(actionFilter));
    }
    if (entityTypeFilter) {
      rows = rows.filter((row) => row.entityType.toLowerCase().includes(entityTypeFilter));
    }

    const physicianIds = Array.from(new Set(rows.map((row) => String(row.userId))));
    const physicians = new Map<string, Doc<"physicians">>();
    for (const physicianId of physicianIds) {
      const physician = await ctx.db.get(physicianId as Id<"physicians">);
      if (physician) physicians.set(physicianId, physician);
    }

    const hydratedRows = rows.map((row) => {
      const physician = physicians.get(String(row.userId));
      return {
        ...row,
        userName: physician
          ? `${physician.lastName}, ${physician.firstName} (${physician.initials})`
          : "Unknown User",
      };
    });

    const { page, nextCursor } = paginateByOffset(hydratedRows, args.cursor, limit);

    return {
      fiscalYear,
      items: page,
      nextCursor,
      totalCount: hydratedRows.length,
    };
  },
});
