import { mutation, query, MutationCtx, QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import { Doc } from "../_generated/dataModel";
import { getCurrentPhysician, requireAdmin } from "../lib/auth";
import {
  canAdminApproveTrade,
  canAdminDenyTrade,
  canProposeTradeAssignments,
  canProposeTradeForFiscalYear,
  canRequesterCancelTrade,
  canTargetRespondToTrade,
} from "../lib/workflowPolicy";
import { enforceRateLimit } from "../lib/rateLimit";
import { getSingleActiveFiscalYear } from "../lib/fiscalYear";

type AnyCtx = QueryCtx | MutationCtx;

type HydratedTrade = Doc<"tradeRequests"> & {
  requesterName: string;
  targetName: string;
  requesterWeekLabel: string;
  targetWeekLabel: string;
  requesterRotationLabel: string;
  targetRotationLabel: string;
};

type TradeSuggestion = {
  physicianId: Doc<"physicians">["_id"];
  physicianName: string;
  physicianInitials: string;
  physicianEmail: string;
  score: number;
  hasServicePreviousWeek: boolean;
  hasServiceNextWeek: boolean;
  preferenceLabel: string;
  suggestedAssignmentCount: number;
  notes: string[];
  suggestedAssignments: Array<{
    assignmentId: Doc<"assignments">["_id"];
    weekLabel: string;
    rotationLabel: string;
  }>;
};

function formatWeekLabel(week: Doc<"weeks"> | null): string {
  if (!week) return "Unknown week";
  return `W${week.weekNumber}: ${week.startDate} to ${week.endDate}`;
}

function formatRotationLabel(rotation: Doc<"rotations"> | null): string {
  return rotation ? `${rotation.name} (${rotation.abbreviation})` : "Unknown rotation";
}

function sortWeeks(weeks: Doc<"weeks">[]) {
  return [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);
}

function scorePreference(preference: Doc<"rotationPreferences"> | null) {
  if (!preference) return { score: -2, label: "No preference on file", notes: ["No rotation preference found"] };
  if (preference.avoid) {
    return { score: -1000, label: "Do Not Assign", notes: ["Marked as cannot do this rotation"] };
  }
  if (preference.preferenceRank !== undefined && preference.preferenceRank !== null) {
    const rankBonus = Math.max(0, 4 - Math.min(preference.preferenceRank, 4));
    return {
      score: rankBonus + 2,
      label: `Preferred (Rank ${preference.preferenceRank})`,
      notes: [`Prefers this rotation (rank ${preference.preferenceRank})`],
    };
  }
  if (preference.deprioritize) {
    return { score: -2, label: "Do Not Prefer", notes: ["Can do this rotation but prefers less of it"] };
  }
  return { score: 1, label: "Willing", notes: ["Willing to cover this rotation"] };
}

async function getActiveTradeFiscalYear(ctx: AnyCtx) {
  return await getSingleActiveFiscalYear(ctx);
}

async function requirePublishedTradeWindow(
  ctx: AnyCtx,
  fiscalYearId: Doc<"fiscalYears">["_id"],
) {
  const fiscalYear = await ctx.db.get(fiscalYearId);
  if (!fiscalYear || !canProposeTradeForFiscalYear(fiscalYear.status)) {
    throw new Error("Trades can only be processed while fiscal year is published");
  }
  return fiscalYear;
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

async function getLatestScheduleRequestForPhysicianFiscalYear(
  ctx: AnyCtx,
  physicianId: Doc<"physicians">["_id"],
  fiscalYearId: Doc<"fiscalYears">["_id"],
) {
  const requests = await ctx.db
    .query("scheduleRequests")
    .withIndex("by_physician_fy", (q) => q.eq("physicianId", physicianId).eq("fiscalYearId", fiscalYearId))
    .collect();
  if (requests.length === 0) return null;

  return [...requests].sort((a, b) => {
    const bySubmittedAt = (b.submittedAt ?? 0) - (a.submittedAt ?? 0);
    if (bySubmittedAt !== 0) return bySubmittedAt;
    return b._creationTime - a._creationTime;
  })[0];
}

async function validatePhysicianCanCoverRotation(args: {
  ctx: AnyCtx;
  fiscalYearId: Doc<"fiscalYears">["_id"];
  physicianId: Doc<"physicians">["_id"];
  rotationId: Doc<"rotations">["_id"];
}) {
  const request = await getLatestScheduleRequestForPhysicianFiscalYear(
    args.ctx,
    args.physicianId,
    args.fiscalYearId,
  );
  if (!request) {
    return {
      allowed: false,
      reason: "No schedule request found for the physician",
    } as const;
  }

  const preference = await args.ctx.db
    .query("rotationPreferences")
    .withIndex("by_request_rotation", (q) =>
      q.eq("scheduleRequestId", request._id).eq("rotationId", args.rotationId),
    )
    .first();

  if (!preference) {
    return {
      allowed: false,
      reason: "No rotation preference found for this rotation",
    } as const;
  }

  if (preference.avoid) {
    return {
      allowed: false,
      reason: "Physician marked this rotation as Do Not Assign",
    } as const;
  }

  return { allowed: true, reason: null } as const;
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
  returns: v.any(),
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
        physicianId: assignment.physicianId ?? null,
        weekNumber: week?.weekNumber ?? null,
        weekId: assignment.weekId,
        rotationId: assignment.rotationId,
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

export const getTradeCandidatesForAssignment = query({
  args: {
    requesterAssignmentId: v.id("assignments"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const physician = await getCurrentPhysician(ctx);
    const fiscalYear = await getActiveTradeFiscalYear(ctx);

    if (!fiscalYear || fiscalYear.status !== "published") {
      return {
        enabled: false,
        reason: "Trades are available only after schedule publication",
        fiscalYear: fiscalYear ?? null,
        requesterAssignment: null,
        suggestions: [],
        excludedSummary: {
          alreadyOnServiceThisWeek: 0,
          missingScheduleRequest: 0,
          missingRotationPreference: 0,
          markedDoNotAssign: 0,
        },
      };
    }

    const calendar = await getPublishedMasterCalendar(ctx, fiscalYear._id);
    if (!calendar) {
      return {
        enabled: false,
        reason: "No published master calendar found",
        fiscalYear,
        requesterAssignment: null,
        suggestions: [],
        excludedSummary: {
          alreadyOnServiceThisWeek: 0,
          missingScheduleRequest: 0,
          missingRotationPreference: 0,
          markedDoNotAssign: 0,
        },
      };
    }

    const requesterAssignment = await ctx.db.get(args.requesterAssignmentId);
    if (!requesterAssignment) {
      throw new Error("Assignment not found");
    }
    if (requesterAssignment.masterCalendarId !== calendar._id) {
      throw new Error("Assignment must belong to the published master calendar");
    }
    if (requesterAssignment.physicianId !== physician._id) {
      throw new Error("Select one of your own assignments");
    }

    const [assignments, weeks, rotations, allPhysicians, requests] = await Promise.all([
      ctx.db
        .query("assignments")
        .withIndex("by_calendar", (q) => q.eq("masterCalendarId", calendar._id))
        .collect(),
      ctx.db
        .query("weeks")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
      ctx.db
        .query("rotations")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
      ctx.db.query("physicians").collect(),
      ctx.db
        .query("scheduleRequests")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
    ]);

    const sortedWeeks = sortWeeks(weeks);
    const weekById = new Map(sortedWeeks.map((week) => [String(week._id), week]));
    const rotationById = new Map(rotations.map((rotation) => [String(rotation._id), rotation]));

    const targetWeek = weekById.get(String(requesterAssignment.weekId)) ?? null;
    const targetRotation = rotationById.get(String(requesterAssignment.rotationId)) ?? null;

    const weekIndexById = new Map(sortedWeeks.map((week, index) => [String(week._id), index]));
    const targetWeekIndex = weekIndexById.get(String(requesterAssignment.weekId)) ?? -1;
    const previousWeek = targetWeekIndex > 0 ? sortedWeeks[targetWeekIndex - 1] : null;
    const nextWeek =
      targetWeekIndex >= 0 && targetWeekIndex < sortedWeeks.length - 1
        ? sortedWeeks[targetWeekIndex + 1]
        : null;

    const assignmentsByPhysician = new Map<string, Doc<"assignments">[]>();
    const assignmentsByPhysicianWeek = new Map<string, Map<string, Doc<"assignments">[]>>();
    const physiciansOnTargetWeek = new Set<string>();
    for (const assignment of assignments) {
      if (!assignment.physicianId) continue;
      const physicianId = String(assignment.physicianId);
      const weekId = String(assignment.weekId);

      const physicianAssignments = assignmentsByPhysician.get(physicianId) ?? [];
      physicianAssignments.push(assignment);
      assignmentsByPhysician.set(physicianId, physicianAssignments);

      const byWeek = assignmentsByPhysicianWeek.get(physicianId) ?? new Map<string, Doc<"assignments">[]>();
      const weekAssignments = byWeek.get(weekId) ?? [];
      weekAssignments.push(assignment);
      byWeek.set(weekId, weekAssignments);
      assignmentsByPhysicianWeek.set(physicianId, byWeek);

      if (weekId === String(requesterAssignment.weekId)) {
        physiciansOnTargetWeek.add(physicianId);
      }
    }

    const sortedRequests = [...requests].sort((a, b) => {
      const bySubmittedAt = (b.submittedAt ?? 0) - (a.submittedAt ?? 0);
      if (bySubmittedAt !== 0) return bySubmittedAt;
      return b._creationTime - a._creationTime;
    });
    const requestByPhysician = new Map<string, Doc<"scheduleRequests">>();
    for (const request of sortedRequests) {
      const physicianId = String(request.physicianId);
      if (!requestByPhysician.has(physicianId)) {
        requestByPhysician.set(physicianId, request);
      }
    }

    const preferencesByRequest = new Map<string, Map<string, Doc<"rotationPreferences">>>();
    await Promise.all(
      Array.from(requestByPhysician.values()).map(async (request) => {
        const preferences = await ctx.db
          .query("rotationPreferences")
          .withIndex("by_request", (q) => q.eq("scheduleRequestId", request._id))
          .collect();
        preferencesByRequest.set(
          String(request._id),
          new Map(preferences.map((preference) => [String(preference.rotationId), preference])),
        );
      }),
    );

    const excludedSummary = {
      alreadyOnServiceThisWeek: 0,
      missingScheduleRequest: 0,
      missingRotationPreference: 0,
      markedDoNotAssign: 0,
    };

    const suggestions: TradeSuggestion[] = [];
    const candidates = allPhysicians
      .filter((candidate) => candidate.isActive)
      .filter((candidate) => String(candidate._id) !== String(physician._id));

    for (const candidate of candidates) {
      const candidateId = String(candidate._id);
      if (physiciansOnTargetWeek.has(candidateId)) {
        excludedSummary.alreadyOnServiceThisWeek += 1;
        continue;
      }

      const request = requestByPhysician.get(candidateId);
      if (!request) {
        excludedSummary.missingScheduleRequest += 1;
        continue;
      }

      const preference = preferencesByRequest
        .get(String(request._id))
        ?.get(String(requesterAssignment.rotationId));
      if (!preference) {
        excludedSummary.missingRotationPreference += 1;
        continue;
      }
      if (preference.avoid) {
        excludedSummary.markedDoNotAssign += 1;
        continue;
      }

      const preferenceResult = scorePreference(preference);
      const byWeek = assignmentsByPhysicianWeek.get(candidateId) ?? new Map<string, Doc<"assignments">[]>();

      const previousAssignments = previousWeek ? byWeek.get(String(previousWeek._id)) ?? [] : [];
      const nextAssignments = nextWeek ? byWeek.get(String(nextWeek._id)) ?? [] : [];

      const hasServicePreviousWeek = previousAssignments.length > 0;
      const hasServiceNextWeek = nextAssignments.length > 0;
      const hasSameRotationPreviousWeek = previousAssignments.some(
        (assignment) => assignment.rotationId === requesterAssignment.rotationId,
      );
      const hasSameRotationNextWeek = nextAssignments.some(
        (assignment) => assignment.rotationId === requesterAssignment.rotationId,
      );

      let continuityScore = 0;
      const continuityNotes: string[] = [];
      if (hasServicePreviousWeek) {
        continuityScore += 2;
        continuityNotes.push("On service previous week");
      } else {
        continuityNotes.push("Off service previous week");
      }

      if (hasServiceNextWeek) {
        continuityScore += 2;
        continuityNotes.push("On service following week");
      } else {
        continuityNotes.push("Off service following week");
      }

      if (!hasServicePreviousWeek && !hasServiceNextWeek) {
        continuityScore -= 2;
        continuityNotes.push("Less ideal: isolated service week");
      }
      if (hasSameRotationPreviousWeek) {
        continuityScore += 1;
        continuityNotes.push("Same rotation previous week");
      }
      if (hasSameRotationNextWeek) {
        continuityScore += 1;
        continuityNotes.push("Same rotation following week");
      }

      const candidateAssignments = (assignmentsByPhysician.get(candidateId) ?? [])
        .filter((assignment) => String(assignment.weekId) !== String(requesterAssignment.weekId))
        .sort((a, b) => {
          const weekA = weekById.get(String(a.weekId))?.weekNumber ?? Number.MAX_SAFE_INTEGER;
          const weekB = weekById.get(String(b.weekId))?.weekNumber ?? Number.MAX_SAFE_INTEGER;
          if (weekA !== weekB) return weekA - weekB;
          return String(a.rotationId).localeCompare(String(b.rotationId));
        })
        .slice(0, 6)
        .map((assignment) => ({
          assignmentId: assignment._id,
          weekLabel: formatWeekLabel(weekById.get(String(assignment.weekId)) ?? null),
          rotationLabel: formatRotationLabel(rotationById.get(String(assignment.rotationId)) ?? null),
        }));

      suggestions.push({
        physicianId: candidate._id,
        physicianName: `${candidate.firstName} ${candidate.lastName}`,
        physicianInitials: candidate.initials,
        physicianEmail: candidate.email,
        score: preferenceResult.score + continuityScore,
        hasServicePreviousWeek,
        hasServiceNextWeek,
        preferenceLabel: preferenceResult.label,
        suggestedAssignmentCount: candidateAssignments.length,
        notes: [...preferenceResult.notes, ...continuityNotes],
        suggestedAssignments: candidateAssignments,
      });
    }

    suggestions.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.physicianName.localeCompare(b.physicianName);
    });

    return {
      enabled: true,
      reason: null,
      fiscalYear,
      requesterAssignment: {
        assignmentId: requesterAssignment._id,
        weekLabel: formatWeekLabel(targetWeek),
        rotationLabel: formatRotationLabel(targetRotation),
      },
      suggestions,
      excludedSummary,
      totalCandidateCount: candidates.length,
    };
  },
});

export const getMyTrades = query({
  args: {},
  returns: v.any(),
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
  returns: v.any(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const fiscalYear = await getActiveTradeFiscalYear(ctx);
    if (!fiscalYear) return [];

    const proposed = await ctx.db
      .query("tradeRequests")
      .withIndex("by_fiscalYear_status", (q) =>
        q.eq("fiscalYearId", fiscalYear._id).eq("status", "proposed"),
      )
      .collect();

    const accepted = await ctx.db
      .query("tradeRequests")
      .withIndex("by_fiscalYear_status", (q) =>
        q.eq("fiscalYearId", fiscalYear._id).eq("status", "peer_accepted"),
      )
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
  returns: v.object({ message: v.string() }),
  handler: async (ctx, args) => {
    const physician = await getCurrentPhysician(ctx);

    const fiscalYear = await getActiveTradeFiscalYear(ctx);
    if (!fiscalYear || !canProposeTradeForFiscalYear(fiscalYear.status)) {
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

    if (
      !canProposeTradeAssignments({
        actorPhysicianId: String(physician._id),
        requesterAssignmentPhysicianId: requesterAssignment.physicianId
          ? String(requesterAssignment.physicianId)
          : null,
        targetAssignmentPhysicianId: targetAssignment.physicianId
          ? String(targetAssignment.physicianId)
          : null,
      })
    ) {
      throw new Error("Choose an assignment from another physician");
    }

    const targetPhysicianId = targetAssignment.physicianId;
    if (!targetPhysicianId) {
      throw new Error("Target assignment must be owned by another physician");
    }

    const [targetCanCoverRequesterRotation, requesterCanCoverTargetRotation] = await Promise.all([
      validatePhysicianCanCoverRotation({
        ctx,
        fiscalYearId: fiscalYear._id,
        physicianId: targetPhysicianId,
        rotationId: requesterAssignment.rotationId,
      }),
      validatePhysicianCanCoverRotation({
        ctx,
        fiscalYearId: fiscalYear._id,
        physicianId: physician._id,
        rotationId: targetAssignment.rotationId,
      }),
    ]);

    if (!targetCanCoverRequesterRotation.allowed) {
      throw new Error(`Target physician is not eligible for this rotation: ${targetCanCoverRequesterRotation.reason}`);
    }
    if (!requesterCanCoverTargetRotation.allowed) {
      throw new Error(`You are not eligible for the requested rotation: ${requesterCanCoverTargetRotation.reason}`);
    }

    const alreadyOpen = await ctx.db
      .query("tradeRequests")
      .withIndex("by_fiscalYear_status", (q) =>
        q.eq("fiscalYearId", fiscalYear._id).eq("status", "proposed"),
      )
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
    await enforceRateLimit(ctx, physician._id, "trade_propose");

    await ctx.db.insert("tradeRequests", {
      fiscalYearId: fiscalYear._id,
      masterCalendarId: calendar._id,
      requestingPhysicianId: physician._id,
      targetPhysicianId,
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
  returns: v.object({ message: v.string() }),
  handler: async (ctx, args) => {
    const physician = await getCurrentPhysician(ctx);
    const trade = await ctx.db.get(args.tradeRequestId);

    if (!trade) throw new Error("Trade request not found");
    await requirePublishedTradeWindow(ctx, trade.fiscalYearId);
    if (
      !canTargetRespondToTrade({
        actorPhysicianId: String(physician._id),
        targetPhysicianId: String(trade.targetPhysicianId),
        status: trade.status,
      })
    ) {
      throw new Error("Only the target physician can respond to this trade");
    }
    await enforceRateLimit(ctx, physician._id, "trade_respond");

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
  returns: v.object({ message: v.string() }),
  handler: async (ctx, args) => {
    const physician = await getCurrentPhysician(ctx);
    const trade = await ctx.db.get(args.tradeRequestId);

    if (!trade) throw new Error("Trade request not found");
    await requirePublishedTradeWindow(ctx, trade.fiscalYearId);
    if (
      !canRequesterCancelTrade({
        actorPhysicianId: String(physician._id),
        requestingPhysicianId: String(trade.requestingPhysicianId),
        status: trade.status,
      })
    ) {
      throw new Error("Only the requester can cancel this trade");
    }
    await enforceRateLimit(ctx, physician._id, "trade_cancel");

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
  returns: v.object({ message: v.string() }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const trade = await ctx.db.get(args.tradeRequestId);

    if (!trade) throw new Error("Trade request not found");
    await requirePublishedTradeWindow(ctx, trade.fiscalYearId);
    if (!canAdminDenyTrade(trade.status)) {
      throw new Error("Trade is not in an admin-resolvable state");
    }
    if (admin.actorPhysicianId) {
      await enforceRateLimit(ctx, admin.actorPhysicianId, "trade_admin_resolve");
    }

    if (!args.approve) {
      await ctx.db.patch(trade._id, {
        status: "admin_denied",
        adminNotes: args.adminNotes,
        resolvedAt: Date.now(),
      });
      return { message: "Trade denied" };
    }

    if (!canAdminApproveTrade(trade.status)) {
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

    const [targetCanCoverRequesterRotation, requesterCanCoverTargetRotation] = await Promise.all([
      validatePhysicianCanCoverRotation({
        ctx,
        fiscalYearId: trade.fiscalYearId,
        physicianId: trade.targetPhysicianId,
        rotationId: trade.requesterRotationId,
      }),
      validatePhysicianCanCoverRotation({
        ctx,
        fiscalYearId: trade.fiscalYearId,
        physicianId: trade.requestingPhysicianId,
        rotationId: trade.targetRotationId,
      }),
    ]);

    if (!targetCanCoverRequesterRotation.allowed) {
      throw new Error(`Cannot approve trade: target physician is not eligible (${targetCanCoverRequesterRotation.reason})`);
    }
    if (!requesterCanCoverTargetRotation.allowed) {
      throw new Error(`Cannot approve trade: requester is not eligible (${requesterCanCoverTargetRotation.reason})`);
    }

    const ts = Date.now();

    await ctx.db.patch(requesterAssignment._id, {
      physicianId: trade.targetPhysicianId,
      assignedBy: admin.actorPhysicianId ?? undefined,
      assignedAt: ts,
    });

    await ctx.db.patch(targetAssignment._id, {
      physicianId: trade.requestingPhysicianId,
      assignedBy: admin.actorPhysicianId ?? undefined,
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
