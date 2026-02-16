import { mutation, query, MutationCtx, QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import { Doc } from "../_generated/dataModel";
import { getCurrentPhysician, requireAdmin } from "../lib/auth";

type AnyCtx = QueryCtx | MutationCtx;

type HydratedTrade = Doc<"tradeRequests"> & {
  requesterName: string;
  targetName: string;
  requesterWeekLabel: string;
  targetWeekLabel: string;
  requesterRotationLabel: string;
  targetRotationLabel: string;
};

function formatWeekLabel(week: Doc<"weeks"> | null): string {
  if (!week) return "Unknown week";
  return `W${week.weekNumber}: ${week.startDate} to ${week.endDate}`;
}

function formatRotationLabel(rotation: Doc<"rotations"> | null): string {
  return rotation ? `${rotation.name} (${rotation.abbreviation})` : "Unknown rotation";
}

async function getActiveTradeFiscalYear(ctx: AnyCtx) {
  const published = await ctx.db
    .query("fiscalYears")
    .withIndex("by_status", (q) => q.eq("status", "published"))
    .first();
  if (published) return published;

  return await ctx.db
    .query("fiscalYears")
    .withIndex("by_status", (q) => q.eq("status", "building"))
    .first();
}

async function getPublishedMasterCalendar(ctx: AnyCtx, fiscalYearId: Doc<"fiscalYears">["_id"]) {
  const calendars = await ctx.db
    .query("masterCalendars")
    .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYearId))
    .collect();

  const published = calendars
    .filter((c) => c.status === "published")
    .sort((a, b) => b.version - a.version)[0];

  return published ?? null;
}

async function getAssignmentFromTrade(
  ctx: AnyCtx,
  masterCalendarId: Doc<"masterCalendars">["_id"],
  weekId: Doc<"weeks">["_id"],
  rotationId: Doc<"rotations">["_id"],
) {
  return await ctx.db
    .query("assignments")
    .withIndex("by_calendar_week_rotation", (q) =>
      q
        .eq("masterCalendarId", masterCalendarId)
        .eq("weekId", weekId)
        .eq("rotationId", rotationId),
    )
    .unique();
}

async function hydrateTrades(ctx: AnyCtx, trades: Array<Doc<"tradeRequests">>): Promise<Array<HydratedTrade>> {
  const physicianIds = new Set<string>();
  const weekIds = new Set<string>();
  const rotationIds = new Set<string>();

  for (const trade of trades) {
    physicianIds.add(String(trade.requestingPhysicianId));
    physicianIds.add(String(trade.targetPhysicianId));
    weekIds.add(String(trade.requesterWeekId));
    weekIds.add(String(trade.targetWeekId));
    rotationIds.add(String(trade.requesterRotationId));
    rotationIds.add(String(trade.targetRotationId));
  }

  const physicians = new Map<string, Doc<"physicians">>();
  for (const id of physicianIds) {
    const physician = await ctx.db.get(id as Doc<"physicians">["_id"]);
    if (physician) physicians.set(id, physician);
  }

  const weeks = new Map<string, Doc<"weeks">>();
  for (const id of weekIds) {
    const week = await ctx.db.get(id as Doc<"weeks">["_id"]);
    if (week) weeks.set(id, week);
  }

  const rotations = new Map<string, Doc<"rotations">>();
  for (const id of rotationIds) {
    const rotation = await ctx.db.get(id as Doc<"rotations">["_id"]);
    if (rotation) rotations.set(id, rotation);
  }

  return trades
    .map((trade) => {
      const requester = physicians.get(String(trade.requestingPhysicianId));
      const target = physicians.get(String(trade.targetPhysicianId));

      return {
        ...trade,
        requesterName: requester
          ? `${requester.firstName} ${requester.lastName}`
          : "Unknown Physician",
        targetName: target ? `${target.firstName} ${target.lastName}` : "Unknown Physician",
        requesterWeekLabel: formatWeekLabel(weeks.get(String(trade.requesterWeekId)) ?? null),
        targetWeekLabel: formatWeekLabel(weeks.get(String(trade.targetWeekId)) ?? null),
        requesterRotationLabel: formatRotationLabel(
          rotations.get(String(trade.requesterRotationId)) ?? null,
        ),
        targetRotationLabel: formatRotationLabel(
          rotations.get(String(trade.targetRotationId)) ?? null,
        ),
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export const getTradeProposalOptions = query({
  args: {},
  handler: async (ctx) => {
    const physician = await getCurrentPhysician(ctx);
    const fiscalYear = await getActiveTradeFiscalYear(ctx);

    if (!fiscalYear || fiscalYear.status !== "published") {
      return {
        enabled: false,
        reason: "Trades are available only after schedule publication",
        fiscalYear: fiscalYear ?? null,
        myAssignments: [],
        availableAssignments: [],
      };
    }

    const calendar = await getPublishedMasterCalendar(ctx, fiscalYear._id);
    if (!calendar) {
      return {
        enabled: false,
        reason: "No published master calendar found",
        fiscalYear,
        myAssignments: [],
        availableAssignments: [],
      };
    }

    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_calendar", (q) => q.eq("masterCalendarId", calendar._id))
      .collect();

    const weekIds = new Set<string>();
    const rotationIds = new Set<string>();
    const physicianIds = new Set<string>();

    for (const assignment of assignments) {
      weekIds.add(String(assignment.weekId));
      rotationIds.add(String(assignment.rotationId));
      if (assignment.physicianId) physicianIds.add(String(assignment.physicianId));
    }

    const weeks = new Map<string, Doc<"weeks">>();
    for (const id of weekIds) {
      const week = await ctx.db.get(id as Doc<"weeks">["_id"]);
      if (week) weeks.set(id, week);
    }

    const rotations = new Map<string, Doc<"rotations">>();
    for (const id of rotationIds) {
      const rotation = await ctx.db.get(id as Doc<"rotations">["_id"]);
      if (rotation) rotations.set(id, rotation);
    }

    const physicians = new Map<string, Doc<"physicians">>();
    for (const id of physicianIds) {
      const p = await ctx.db.get(id as Doc<"physicians">["_id"]);
      if (p) physicians.set(id, p);
    }

    const itemFor = (assignment: Doc<"assignments">) => {
      const week = weeks.get(String(assignment.weekId));
      const rotation = rotations.get(String(assignment.rotationId));
      const assignee = assignment.physicianId
        ? physicians.get(String(assignment.physicianId))
        : null;

      return {
        assignmentId: assignment._id,
        weekLabel: formatWeekLabel(week ?? null),
        rotationLabel: formatRotationLabel(rotation ?? null),
        physicianName: assignee ? `${assignee.firstName} ${assignee.lastName}` : "Unassigned",
      };
    };

    const myAssignments = assignments
      .filter((assignment) => assignment.physicianId === physician._id)
      .map(itemFor);

    const availableAssignments = assignments
      .filter((assignment) => assignment.physicianId && assignment.physicianId !== physician._id)
      .map(itemFor);

    return {
      enabled: true,
      reason: null,
      fiscalYear,
      myAssignments,
      availableAssignments,
    };
  },
});

export const getMyTrades = query({
  args: {},
  handler: async (ctx) => {
    const physician = await getCurrentPhysician(ctx);

    const outgoing = await ctx.db
      .query("tradeRequests")
      .withIndex("by_requesting_physician", (q) => q.eq("requestingPhysicianId", physician._id))
      .collect();

    const incoming = await ctx.db
      .query("tradeRequests")
      .withIndex("by_target_physician", (q) => q.eq("targetPhysicianId", physician._id))
      .collect();

    const all = new Map<string, Doc<"tradeRequests">>();
    for (const trade of [...outgoing, ...incoming]) {
      all.set(String(trade._id), trade);
    }

    return await hydrateTrades(ctx, Array.from(all.values()));
  },
});

export const getAdminTradeQueue = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const proposed = await ctx.db
      .query("tradeRequests")
      .withIndex("by_status", (q) => q.eq("status", "proposed"))
      .collect();

    const accepted = await ctx.db
      .query("tradeRequests")
      .withIndex("by_status", (q) => q.eq("status", "peer_accepted"))
      .collect();

    return await hydrateTrades(ctx, [...proposed, ...accepted]);
  },
});

export const proposeTrade = mutation({
  args: {
    requesterAssignmentId: v.id("assignments"),
    targetAssignmentId: v.id("assignments"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const physician = await getCurrentPhysician(ctx);

    const fiscalYear = await getActiveTradeFiscalYear(ctx);
    if (!fiscalYear || fiscalYear.status !== "published") {
      throw new Error("Trades are available only for published schedules");
    }

    const calendar = await getPublishedMasterCalendar(ctx, fiscalYear._id);
    if (!calendar) throw new Error("No published master calendar found");

    const requesterAssignment = await ctx.db.get(args.requesterAssignmentId);
    const targetAssignment = await ctx.db.get(args.targetAssignmentId);

    if (!requesterAssignment || !targetAssignment) {
      throw new Error("Assignment not found");
    }

    if (
      requesterAssignment.masterCalendarId !== calendar._id ||
      targetAssignment.masterCalendarId !== calendar._id
    ) {
      throw new Error("Assignments must belong to published master calendar");
    }

    if (requesterAssignment.physicianId !== physician._id) {
      throw new Error("You can only trade assignments currently assigned to you");
    }

    if (!targetAssignment.physicianId || targetAssignment.physicianId === physician._id) {
      throw new Error("Choose an assignment from another physician");
    }

    const alreadyOpen = await ctx.db
      .query("tradeRequests")
      .withIndex("by_status", (q) => q.eq("status", "proposed"))
      .collect();

    const duplicate = alreadyOpen.find(
      (trade) =>
        trade.masterCalendarId === calendar._id &&
        trade.requesterWeekId === requesterAssignment.weekId &&
        trade.requesterRotationId === requesterAssignment.rotationId &&
        trade.targetWeekId === targetAssignment.weekId &&
        trade.targetRotationId === targetAssignment.rotationId,
    );

    if (duplicate) {
      throw new Error("A matching open trade request already exists");
    }

    await ctx.db.insert("tradeRequests", {
      fiscalYearId: fiscalYear._id,
      masterCalendarId: calendar._id,
      requestingPhysicianId: physician._id,
      targetPhysicianId: targetAssignment.physicianId,
      requesterWeekId: requesterAssignment.weekId,
      requesterRotationId: requesterAssignment.rotationId,
      targetWeekId: targetAssignment.weekId,
      targetRotationId: targetAssignment.rotationId,
      status: "proposed",
      reason: args.reason,
      createdAt: Date.now(),
    });

    return { message: "Trade proposed" };
  },
});

export const respondToTrade = mutation({
  args: {
    tradeRequestId: v.id("tradeRequests"),
    decision: v.union(v.literal("accept"), v.literal("decline")),
  },
  handler: async (ctx, args) => {
    const physician = await getCurrentPhysician(ctx);
    const trade = await ctx.db.get(args.tradeRequestId);

    if (!trade) throw new Error("Trade request not found");
    if (trade.targetPhysicianId !== physician._id) {
      throw new Error("Only the target physician can respond to this trade");
    }
    if (trade.status !== "proposed") {
      throw new Error("This trade request is not awaiting peer response");
    }

    await ctx.db.patch(trade._id, {
      status: args.decision === "accept" ? "peer_accepted" : "peer_declined",
      resolvedAt: args.decision === "decline" ? Date.now() : undefined,
    });

    return { message: args.decision === "accept" ? "Trade accepted" : "Trade declined" };
  },
});

export const cancelTrade = mutation({
  args: {
    tradeRequestId: v.id("tradeRequests"),
  },
  handler: async (ctx, args) => {
    const physician = await getCurrentPhysician(ctx);
    const trade = await ctx.db.get(args.tradeRequestId);

    if (!trade) throw new Error("Trade request not found");
    if (trade.requestingPhysicianId !== physician._id) {
      throw new Error("Only the requester can cancel this trade");
    }

    if (trade.status !== "proposed" && trade.status !== "peer_accepted") {
      throw new Error("Only proposed or peer accepted trades can be cancelled");
    }

    await ctx.db.patch(trade._id, {
      status: "cancelled",
      resolvedAt: Date.now(),
    });

    return { message: "Trade cancelled" };
  },
});

export const adminResolveTrade = mutation({
  args: {
    tradeRequestId: v.id("tradeRequests"),
    approve: v.boolean(),
    adminNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const trade = await ctx.db.get(args.tradeRequestId);

    if (!trade) throw new Error("Trade request not found");
    if (trade.status !== "peer_accepted" && trade.status !== "proposed") {
      throw new Error("Trade is not in an admin-resolvable state");
    }

    if (!args.approve) {
      await ctx.db.patch(trade._id, {
        status: "admin_denied",
        adminNotes: args.adminNotes,
        resolvedAt: Date.now(),
      });
      return { message: "Trade denied" };
    }

    if (trade.status !== "peer_accepted") {
      throw new Error("Trade must be accepted by target physician before admin approval");
    }

    const requesterAssignment = await getAssignmentFromTrade(
      ctx,
      trade.masterCalendarId,
      trade.requesterWeekId,
      trade.requesterRotationId,
    );
    const targetAssignment = await getAssignmentFromTrade(
      ctx,
      trade.masterCalendarId,
      trade.targetWeekId,
      trade.targetRotationId,
    );

    if (!requesterAssignment || !targetAssignment) {
      throw new Error("Trade assignment no longer exists");
    }

    if (
      requesterAssignment.physicianId !== trade.requestingPhysicianId ||
      targetAssignment.physicianId !== trade.targetPhysicianId
    ) {
      throw new Error("Assignments changed since trade was proposed");
    }

    const ts = Date.now();

    await ctx.db.patch(requesterAssignment._id, {
      physicianId: trade.targetPhysicianId,
      assignedBy: admin._id,
      assignedAt: ts,
    });

    await ctx.db.patch(targetAssignment._id, {
      physicianId: trade.requestingPhysicianId,
      assignedBy: admin._id,
      assignedAt: ts,
    });

    await ctx.db.patch(trade._id, {
      status: "admin_approved",
      adminNotes: args.adminNotes,
      resolvedAt: ts,
    });

    return { message: "Trade approved and assignments swapped" };
  },
});
