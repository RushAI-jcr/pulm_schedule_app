import { mutation, query, QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { requireAdmin, requireAuthenticatedUser } from "../lib/auth";
import { getNextMasterCalendarVersion } from "../lib/masterCalendar";
import { canMapCalendarForFiscalYear } from "../lib/workflowPolicy";
import { getSingleActiveFiscalYear } from "../lib/fiscalYear";
import {
  Availability,
  round4,
  sortCandidatesByAvailabilityAndHeadroom,
  wouldExceedMaxConsecutiveWeeks,
} from "../lib/masterCalendarAssignments";
import {
  getMissingActiveRotationIds,
  getRotationConfigurationIssues,
} from "../lib/rotationPreferenceReadiness";
import { publishDraftCalendarForFiscalYear } from "../lib/masterCalendarPublish";
import {
  sortWeeksByWeekNumber,
  sortActiveRotations,
  sortActivePhysicians,
} from "../lib/sorting";

const DEFAULT_AVAILABILITY: Availability = "yellow";
const CFTE_EPSILON = 0.000_001;

type AnyCtx = QueryCtx | MutationCtx;

async function getAdminAndCurrentFiscalYear(ctx: AnyCtx) {
  const admin = await requireAdmin(ctx);
  const fiscalYear = await getSingleActiveFiscalYear(ctx);
  return { admin, fiscalYear };
}

function requireBuildingWindow(fiscalYear: Pick<Doc<"fiscalYears">, "status">) {
  if (!canMapCalendarForFiscalYear(fiscalYear.status)) {
    throw new Error("Calendar mapping is only available while fiscal year is building");
  }
}

async function getDraftCalendarForFiscalYear(
  ctx: AnyCtx,
  fiscalYearId: Id<"fiscalYears">,
): Promise<Doc<"masterCalendars"> | null> {
  const calendars = await ctx.db
    .query("masterCalendars")
    .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYearId))
    .collect();

  return (
    calendars
      .filter((calendar) => calendar.status === "draft")
      .sort((a, b) => b.version - a.version)[0] ?? null
  );
}

async function getPublishedCalendarForFiscalYear(
  ctx: AnyCtx,
  fiscalYearId: Id<"fiscalYears">,
): Promise<Doc<"masterCalendars"> | null> {
  const calendars = await ctx.db
    .query("masterCalendars")
    .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYearId))
    .collect();

  return (
    calendars
      .filter((calendar) => calendar.status === "published")
      .sort((a, b) => b.version - a.version)[0] ?? null
  );
}

function toCellKey(weekId: Id<"weeks">, rotationId: Id<"rotations">) {
  return `${String(weekId)}:${String(rotationId)}`;
}

function getAvailabilityForPhysicianWeek(
  availabilityByPhysicianWeek: Map<string, Map<string, Availability>>,
  physicianId: string,
  weekId: string,
): Availability {
  return availabilityByPhysicianWeek.get(physicianId)?.get(weekId) ?? DEFAULT_AVAILABILITY;
}

type RotationPreference = {
  avoid: boolean;
  deprioritize: boolean;
  preferenceRank: number | null;
};

function getRotationPreferenceForPhysicianRotation(
  preferencesByPhysicianRotation: Map<string, Map<string, RotationPreference>>,
  physicianId: string,
  rotationId: string,
): RotationPreference | null {
  return preferencesByPhysicianRotation.get(physicianId)?.get(rotationId) ?? null;
}

async function getAvailabilityByPhysicianWeek(
  ctx: AnyCtx,
  fiscalYearId: Id<"fiscalYears">,
): Promise<Map<string, Map<string, Availability>>> {
  const requests = await ctx.db
    .query("scheduleRequests")
    .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYearId))
    .collect();

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

  const availabilityByPhysicianWeek = new Map<string, Map<string, Availability>>();
  for (const request of requestByPhysician.values()) {
    const preferences = await ctx.db
      .query("weekPreferences")
      .withIndex("by_request", (q) => q.eq("scheduleRequestId", request._id))
      .collect();

    const weekMap = new Map<string, Availability>();
    for (const preference of preferences) {
      weekMap.set(String(preference.weekId), preference.availability as Availability);
    }

    availabilityByPhysicianWeek.set(String(request.physicianId), weekMap);
  }

  return availabilityByPhysicianWeek;
}

async function getRotationPreferencesByPhysicianRotation(
  ctx: AnyCtx,
  fiscalYearId: Id<"fiscalYears">,
): Promise<Map<string, Map<string, RotationPreference>>> {
  const requests = await ctx.db
    .query("scheduleRequests")
    .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYearId))
    .collect();

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

  const preferencesByPhysicianRotation = new Map<string, Map<string, RotationPreference>>();
  for (const request of requestByPhysician.values()) {
    const preferences = await ctx.db
      .query("rotationPreferences")
      .withIndex("by_request", (q) => q.eq("scheduleRequestId", request._id))
      .collect();

    const rotationMap = new Map<string, RotationPreference>();
    for (const preference of preferences) {
      rotationMap.set(String(preference.rotationId), {
        avoid: preference.avoid,
        deprioritize: Boolean(preference.deprioritize),
        preferenceRank: preference.preferenceRank ?? null,
      });
    }

    preferencesByPhysicianRotation.set(String(request.physicianId), rotationMap);
  }

  return preferencesByPhysicianRotation;
}

type PhysicianRotationReadinessIssue = {
  physicianId: string;
  initials: string;
  name: string;
  blockingReasons: string[];
};

async function getRotationPreferenceReadinessIssues(
  ctx: AnyCtx,
  fiscalYearId: Id<"fiscalYears">,
  physicians: Doc<"physicians">[],
  activeRotations: Doc<"rotations">[],
) {
  const requests = await ctx.db
    .query("scheduleRequests")
    .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYearId))
    .collect();

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

  const rotationConfigurationIssues = getRotationConfigurationIssues(
    activeRotations.map((rotation) => rotation.name),
  );
  const activeRotationIds = activeRotations.map((rotation) => String(rotation._id));
  const rotationNameById = new Map(activeRotations.map((rotation) => [String(rotation._id), rotation.name]));

  const issues = await Promise.all(
    physicians.map(async (physician): Promise<PhysicianRotationReadinessIssue | null> => {
      const request = requestByPhysician.get(String(physician._id));
      const blockingReasons: string[] = [];
      if (!request) {
        blockingReasons.push("No schedule request exists for this fiscal year.");
      }

      let missingRotationNames: string[] = [];
      if (request) {
        const preferences = await ctx.db
          .query("rotationPreferences")
          .withIndex("by_request", (q) => q.eq("scheduleRequestId", request._id))
          .collect();
        const missingRotationIds = getMissingActiveRotationIds({
          activeRotationIds,
          configuredRotationIds: Array.from(
            new Set(preferences.map((preference) => String(preference.rotationId))),
          ),
        });
        missingRotationNames = missingRotationIds
          .map((rotationId) => rotationNameById.get(rotationId))
          .filter((name): name is string => Boolean(name));
        if (missingRotationNames.length > 0) {
          blockingReasons.push(`Missing preferences for: ${missingRotationNames.join(", ")}`);
        }

        const approvalStatus = request.rotationPreferenceApprovalStatus ?? "pending";
        if (approvalStatus !== "approved") {
          blockingReasons.push("Awaiting admin approval.");
        }
      }

      if (blockingReasons.length === 0) return null;
      return {
        physicianId: String(physician._id),
        initials: physician.initials,
        name: `${physician.firstName} ${physician.lastName}`,
        blockingReasons,
      };
    }),
  );

  return {
    rotationConfigurationIssues,
    physicianIssues: issues.filter((issue): issue is PhysicianRotationReadinessIssue => issue !== null),
  };
}

function formatRotationPreferenceGateMessage(args: {
  rotationConfigurationIssues: ReturnType<typeof getRotationConfigurationIssues>;
  physicianIssues: PhysicianRotationReadinessIssue[];
}) {
  const lines = ["Rotation preferences are incomplete or unapproved. Calendar mapping is blocked."];
  if (!args.rotationConfigurationIssues.isValid) {
    if (args.rotationConfigurationIssues.missingRequiredNames.length > 0) {
      lines.push(
        `Missing required active rotations: ${args.rotationConfigurationIssues.missingRequiredNames.join(", ")}.`,
      );
    }
    if (args.rotationConfigurationIssues.unexpectedNames.length > 0) {
      lines.push(
        `Unexpected active rotations: ${args.rotationConfigurationIssues.unexpectedNames.join(", ")}.`,
      );
    }
  }

  if (args.physicianIssues.length > 0) {
    const sample = args.physicianIssues
      .slice(0, 5)
      .map((row) => `${row.initials} (${row.name}): ${row.blockingReasons.join(" ")}`)
      .join(", ");
    const suffix = args.physicianIssues.length > 5 ? ` +${args.physicianIssues.length - 5} more` : "";
    lines.push(`Blocking physicians: ${sample}${suffix}`);
  }

  return lines.join(" ");
}

async function getClinicCfteByPhysician(
  ctx: AnyCtx,
  fiscalYearId: Id<"fiscalYears">,
): Promise<Map<string, number>> {
  const [clinicTypes, clinicAssignments] = await Promise.all([
    ctx.db
      .query("clinicTypes")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYearId))
      .collect(),
    ctx.db
      .query("physicianClinics")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYearId))
      .collect(),
  ]);

  const cftePerHalfDayByClinicTypeId = new Map<string, number>(
    clinicTypes.map((clinicType) => [
      String(clinicType._id),
      clinicType.cftePerHalfDay,
    ]),
  );

  const clinicCfteByPhysician = new Map<string, number>();
  for (const assignment of clinicAssignments) {
    const cftePerHalfDay = cftePerHalfDayByClinicTypeId.get(String(assignment.clinicTypeId));
    if (cftePerHalfDay === undefined) continue;

    const physicianId = String(assignment.physicianId);
    const current = clinicCfteByPhysician.get(physicianId) ?? 0;
    clinicCfteByPhysician.set(
      physicianId,
      current + assignment.halfDaysPerWeek * cftePerHalfDay * assignment.activeWeeks,
    );
  }

  return clinicCfteByPhysician;
}

async function getTargetCfteByPhysician(
  ctx: AnyCtx,
  fiscalYearId: Id<"fiscalYears">,
): Promise<Map<string, number>> {
  const targets = await ctx.db
    .query("physicianCfteTargets")
    .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYearId))
    .collect();

  return new Map<string, number>(
    targets.map((target) => [String(target.physicianId), target.targetCfte]),
  );
}

function getRotationCfteByPhysician(
  assignments: Doc<"assignments">[],
  rotationsById: Map<string, Doc<"rotations">>,
): Map<string, number> {
  const rotationCfteByPhysician = new Map<string, number>();

  for (const assignment of assignments) {
    if (!assignment.physicianId) continue;

    const rotation = rotationsById.get(String(assignment.rotationId));
    if (!rotation) continue;

    const physicianId = String(assignment.physicianId);
    const current = rotationCfteByPhysician.get(physicianId) ?? 0;
    rotationCfteByPhysician.set(physicianId, current + rotation.cftePerWeek);
  }

  return rotationCfteByPhysician;
}

function getWeekNumberByWeekId(weeks: Doc<"weeks">[]) {
  return new Map<string, number>(weeks.map((week) => [String(week._id), week.weekNumber]));
}

function getWeekNumbersForRotationByPhysician(
  assignments: Doc<"assignments">[],
  weekNumberByWeekId: Map<string, number>,
  rotationId: string,
  physicianId: string,
  weekIdToOverride?: string,
): number[] {
  const weekNumbers: number[] = [];

  for (const assignment of assignments) {
    if (String(assignment.rotationId) !== rotationId) continue;

    let assignedPhysicianId = assignment.physicianId ? String(assignment.physicianId) : null;
    if (weekIdToOverride && String(assignment.weekId) === weekIdToOverride) {
      assignedPhysicianId = physicianId;
    }

    if (assignedPhysicianId !== physicianId) continue;

    const weekNumber = weekNumberByWeekId.get(String(assignment.weekId));
    if (weekNumber === undefined) continue;
    weekNumbers.push(weekNumber);
  }

  return weekNumbers;
}

async function getCfteSummary({
  ctx,
  fiscalYearId,
  calendarId,
  physicians,
}: {
  ctx: AnyCtx;
  fiscalYearId: Id<"fiscalYears">;
  calendarId: Id<"masterCalendars"> | null;
  physicians: Doc<"physicians">[];
}) {
  const [rotations, clinicCfteByPhysician, targetCfteByPhysician] = await Promise.all([
    ctx.db
      .query("rotations")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYearId))
      .collect(),
    getClinicCfteByPhysician(ctx, fiscalYearId),
    getTargetCfteByPhysician(ctx, fiscalYearId),
  ]);

  const rotationsById = new Map<string, Doc<"rotations">>(
    rotations.map((rotation) => [String(rotation._id), rotation]),
  );

  const assignments: Doc<"assignments">[] =
    calendarId === null
      ? []
      : await ctx.db
          .query("assignments")
          .withIndex("by_calendar", (q) => q.eq("masterCalendarId", calendarId))
          .collect();

  const rotationCfteByPhysician = getRotationCfteByPhysician(assignments, rotationsById);

  return physicians.map((physician) => {
    const physicianId = String(physician._id);
    const clinicCfte = round4(clinicCfteByPhysician.get(physicianId) ?? 0);
    const rotationCfte = round4(rotationCfteByPhysician.get(physicianId) ?? 0);
    const totalCfte = round4(clinicCfte + rotationCfte);
    const targetCfte = targetCfteByPhysician.get(physicianId) ?? null;

    return {
      physicianId: physician._id,
      physicianName: `${physician.lastName}, ${physician.firstName}`,
      initials: physician.initials,
      targetCfte,
      clinicCfte,
      rotationCfte,
      totalCfte,
      headroom: targetCfte === null ? null : round4(targetCfte - totalCfte),
      isOverTarget: targetCfte !== null && totalCfte > targetCfte + CFTE_EPSILON,
    };
  });
}

function buildAvailabilityEntries({
  physicians,
  weeks,
  availabilityByPhysicianWeek,
}: {
  physicians: Doc<"physicians">[];
  weeks: Doc<"weeks">[];
  availabilityByPhysicianWeek: Map<string, Map<string, Availability>>;
}) {
  const entries: Array<{
    physicianId: Id<"physicians">;
    weekId: Id<"weeks">;
    availability: Availability;
  }> = [];

  for (const physician of physicians) {
    const physicianId = String(physician._id);
    for (const week of weeks) {
      entries.push({
        physicianId: physician._id,
        weekId: week._id,
        availability: getAvailabilityForPhysicianWeek(
          availabilityByPhysicianWeek,
          physicianId,
          String(week._id),
        ),
      });
    }
  }

  return entries;
}

export const getCurrentFiscalYearMasterCalendarDraft = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const { fiscalYear } = await getAdminAndCurrentFiscalYear(ctx);
    if (!fiscalYear) {
      return {
        fiscalYear: null,
        calendar: null,
        rotations: [],
        weeks: [],
        grid: [],
        physicians: [],
        availabilityEntries: [],
        cfteSummary: [],
      };
    }

    const [weeks, rotations, physicians] = await Promise.all([
      ctx.db
        .query("weeks")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
      ctx.db
        .query("rotations")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
      ctx.db
        .query("physicians")
        .collect(),
    ]);

    const sortedWeeks = sortWeeksByWeekNumber(weeks);
    const activeRotations = sortActiveRotations(rotations);
    const activePhysicians = sortActivePhysicians(physicians);
    const draftCalendar = await getDraftCalendarForFiscalYear(ctx, fiscalYear._id);
    const availabilityByPhysicianWeek = await getAvailabilityByPhysicianWeek(ctx, fiscalYear._id);
    const availabilityEntries = buildAvailabilityEntries({
      physicians: activePhysicians,
      weeks: sortedWeeks,
      availabilityByPhysicianWeek,
    });

    if (!draftCalendar) {
      return {
        fiscalYear,
        calendar: null,
        rotations: activeRotations,
        weeks: sortedWeeks,
        grid: [],
        physicians: activePhysicians.map((physician) => ({
          _id: physician._id,
          fullName: `${physician.firstName} ${physician.lastName}`,
          initials: physician.initials,
          role: physician.role,
        })),
        availabilityEntries,
        cfteSummary: await getCfteSummary({
          ctx,
          fiscalYearId: fiscalYear._id,
          calendarId: null,
          physicians: activePhysicians,
        }),
      };
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

    const grid = sortedWeeks.map((week) => ({
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

    return {
      fiscalYear,
      calendar: draftCalendar,
      rotations: activeRotations,
      weeks: sortedWeeks,
      grid,
      physicians: activePhysicians.map((physician) => ({
        _id: physician._id,
        fullName: `${physician.firstName} ${physician.lastName}`,
        initials: physician.initials,
        role: physician.role,
      })),
      availabilityEntries,
      cfteSummary: await getCfteSummary({
        ctx,
        fiscalYearId: fiscalYear._id,
        calendarId: draftCalendar._id,
        physicians: activePhysicians,
      }),
    };
  },
});

export const getCurrentFiscalYearPublishedMasterCalendar = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    await requireAuthenticatedUser(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) {
      return {
        fiscalYear: null,
        calendar: null,
        rotations: [],
        weeks: [],
        grid: [],
      };
    }

    const [weeks, rotations, physicians] = await Promise.all([
      ctx.db
        .query("weeks")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
      ctx.db
        .query("rotations")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
      ctx.db.query("physicians").collect(),
    ]);

    const sortedWeeks = sortWeeksByWeekNumber(weeks);
    const activeRotations = sortActiveRotations(rotations);
    const publishedCalendar = await getPublishedCalendarForFiscalYear(ctx, fiscalYear._id);
    if (!publishedCalendar) {
      return {
        fiscalYear,
        calendar: null,
        rotations: activeRotations,
        weeks: sortedWeeks,
        grid: [],
      };
    }

    const physicianById = new Map(
      physicians.map((physician) => [String(physician._id), physician]),
    );

    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_calendar", (q) => q.eq("masterCalendarId", publishedCalendar._id))
      .collect();

    const assignmentByKey = new Map(
      assignments.map((assignment) => [
        `${String(assignment.weekId)}:${String(assignment.rotationId)}`,
        assignment,
      ]),
    );

    const grid = sortedWeeks.map((week) => ({
      weekId: week._id,
      weekNumber: week.weekNumber,
      startDate: week.startDate,
      endDate: week.endDate,
      cells: activeRotations.map((rotation) => {
        const assignment = assignmentByKey.get(`${String(week._id)}:${String(rotation._id)}`);
        const physician =
          assignment?.physicianId
            ? physicianById.get(String(assignment.physicianId)) ?? null
            : null;

        return {
          rotationId: rotation._id,
          assignmentId: assignment?._id ?? null,
          physicianId: assignment?.physicianId ?? null,
          physicianName: physician ? `${physician.firstName} ${physician.lastName}` : null,
          physicianInitials: physician?.initials ?? null,
        };
      }),
    }));

    return {
      fiscalYear,
      calendar: publishedCalendar,
      rotations: activeRotations,
      weeks: sortedWeeks,
      grid,
    };
  },
});

export const createCurrentFiscalYearMasterCalendarDraft = mutation({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const { fiscalYear } = await getAdminAndCurrentFiscalYear(ctx);
    if (!fiscalYear) throw new Error("No active fiscal year available");
    requireBuildingWindow(fiscalYear);

    const [weeks, rotations, calendars, physicians] = await Promise.all([
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
      ctx.db.query("physicians").collect(),
    ]);

    const existingDraft = calendars
      .filter((calendar) => calendar.status === "draft")
      .sort((a, b) => b.version - a.version)[0];
    if (existingDraft) {
      return { message: "Draft already exists", calendarId: existingDraft._id };
    }

    const activePhysicians = sortActivePhysicians(physicians);
    const activeRotations = sortActiveRotations(rotations);
    const readiness = await getRotationPreferenceReadinessIssues(
      ctx,
      fiscalYear._id,
      activePhysicians,
      activeRotations,
    );
    if (!readiness.rotationConfigurationIssues.isValid || readiness.physicianIssues.length > 0) {
      throw new Error(formatRotationPreferenceGateMessage(readiness));
    }

    const version = getNextMasterCalendarVersion(calendars.map((calendar) => calendar.version));
    const calendarId = await ctx.db.insert("masterCalendars", {
      fiscalYearId: fiscalYear._id,
      version,
      status: "draft",
    });

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

export const importCurrentFiscalYearMasterCalendarFromRows = mutation({
  returns: v.any(),
  args: {
    rows: v.array(
      v.object({
        weekStart: v.string(),
        assignments: v.array(
          v.object({
            rotationName: v.string(),
            physicianInitials: v.string(),
          }),
        ),
      }),
    ),
    replaceExisting: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { admin, fiscalYear } = await getAdminAndCurrentFiscalYear(ctx);
    if (!fiscalYear) throw new Error("No active fiscal year available");

    const [weeks, rotations, physicians, calendars] = await Promise.all([
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
        .query("masterCalendars")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
    ]);

    const sortedWeeks = sortWeeksByWeekNumber(weeks);
    const activeRotations = sortActiveRotations(rotations);
    const activePhysicians = sortActivePhysicians(physicians);

    if (sortedWeeks.length === 0) {
      throw new Error("No weeks are configured for the active fiscal year");
    }
    if (activeRotations.length === 0) {
      throw new Error("No active rotations are configured for the active fiscal year");
    }

    let draftCalendar: Doc<"masterCalendars"> | null = calendars
      .filter((calendar) => calendar.status === "draft")
      .sort((a, b) => b.version - a.version)[0] ?? null;

    if (!draftCalendar) {
      const version = getNextMasterCalendarVersion(calendars.map((calendar) => calendar.version));
      const draftCalendarId = await ctx.db.insert("masterCalendars", {
        fiscalYearId: fiscalYear._id,
        version,
        status: "draft",
      });
      draftCalendar = await ctx.db.get(draftCalendarId);
      if (!draftCalendar) {
        throw new Error("Failed to create draft calendar");
      }
    }

    let assignmentCells = await ctx.db
      .query("assignments")
      .withIndex("by_calendar", (q) => q.eq("masterCalendarId", draftCalendar._id))
      .collect();

    if (assignmentCells.length === 0) {
      for (const week of sortedWeeks) {
        for (const rotation of activeRotations) {
          await ctx.db.insert("assignments", {
            masterCalendarId: draftCalendar._id,
            weekId: week._id,
            rotationId: rotation._id,
            physicianId: undefined,
            assignedBy: undefined,
            assignedAt: undefined,
          });
        }
      }
      assignmentCells = await ctx.db
        .query("assignments")
        .withIndex("by_calendar", (q) => q.eq("masterCalendarId", draftCalendar._id))
        .collect();
    }

    if (args.replaceExisting ?? true) {
      for (const cell of assignmentCells) {
        await ctx.db.patch(cell._id, {
          physicianId: undefined,
          assignedBy: undefined,
          assignedAt: undefined,
        });
      }
    }

    const weekByStart = new Map(sortedWeeks.map((week) => [week.startDate, week]));
    const rotationByName = new Map(
      activeRotations.map((rotation) => [rotation.name.trim().toLowerCase(), rotation]),
    );
    const physicianByInitials = new Map(
      activePhysicians.map((physician) => [physician.initials.trim().toUpperCase(), physician]),
    );
    const assignmentByCell = new Map<string, Doc<"assignments">>(
      assignmentCells.map((assignment) => [toCellKey(assignment.weekId, assignment.rotationId), assignment]),
    );

    const unknownWeekStarts = new Set<string>();
    const unknownRotationNames = new Set<string>();
    const unknownPhysicianInitials = new Set<string>();
    let importedAssignments = 0;
    const now = Date.now();

    for (const row of args.rows) {
      const week = weekByStart.get(row.weekStart);
      if (!week) {
        unknownWeekStarts.add(row.weekStart);
        continue;
      }

      for (const item of row.assignments) {
        const rotation = rotationByName.get(item.rotationName.trim().toLowerCase());
        if (!rotation) {
          unknownRotationNames.add(item.rotationName);
          continue;
        }

        const physician = physicianByInitials.get(item.physicianInitials.trim().toUpperCase());
        if (!physician) {
          unknownPhysicianInitials.add(item.physicianInitials);
          continue;
        }

        const cell = assignmentByCell.get(toCellKey(week._id, rotation._id));
        if (!cell) continue;

        await ctx.db.patch(cell._id, {
          physicianId: physician._id,
          assignedBy: admin.actorPhysicianId ?? undefined,
          assignedAt: now,
        });
        importedAssignments += 1;
      }
    }

    return {
      message: `Imported ${importedAssignments} assignment(s) into draft v${draftCalendar.version}`,
      calendarId: draftCalendar._id,
      importedAssignments,
      unknownWeekStarts: Array.from(unknownWeekStarts).sort(),
      unknownRotationNames: Array.from(unknownRotationNames).sort(),
      unknownPhysicianInitials: Array.from(unknownPhysicianInitials).sort(),
    };
  },
});

export const assignCurrentFiscalYearDraftCell = mutation({
  args: {
    weekId: v.id("weeks"),
    rotationId: v.id("rotations"),
    physicianId: v.optional(v.id("physicians")),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { admin, fiscalYear } = await getAdminAndCurrentFiscalYear(ctx);
    if (!fiscalYear) throw new Error("No active fiscal year available");
    requireBuildingWindow(fiscalYear);

    const [week, rotation, physician] = await Promise.all([
      ctx.db.get(args.weekId),
      ctx.db.get(args.rotationId),
      args.physicianId ? ctx.db.get(args.physicianId) : Promise.resolve(null),
    ]);

    if (!week || week.fiscalYearId !== fiscalYear._id) {
      throw new Error("Invalid week selected");
    }
    if (!rotation || rotation.fiscalYearId !== fiscalYear._id) {
      throw new Error("Invalid rotation selected");
    }
    if (args.physicianId && (!physician || !physician.isActive)) {
      throw new Error("Invalid physician selected");
    }

    const draftCalendar = await getDraftCalendarForFiscalYear(ctx, fiscalYear._id);
    if (!draftCalendar) throw new Error("Create a draft calendar before assigning physicians");

    const assignment = await ctx.db
      .query("assignments")
      .withIndex("by_calendar_week_rotation", (q) =>
        q
          .eq("masterCalendarId", draftCalendar._id)
          .eq("weekId", args.weekId)
          .eq("rotationId", args.rotationId),
      )
      .first();

    if (!assignment) throw new Error("Assignment cell not found");

    const currentPhysicianId = assignment.physicianId ? String(assignment.physicianId) : null;
    const nextPhysicianId = args.physicianId ? String(args.physicianId) : null;
    if (currentPhysicianId === nextPhysicianId) {
      return { message: "No assignment changes", warnings: [], cfteSummary: [] };
    }

    const [allWeeks, assignments, allRotations] = await Promise.all([
      ctx.db
        .query("weeks")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
      ctx.db
        .query("assignments")
        .withIndex("by_calendar", (q) => q.eq("masterCalendarId", draftCalendar._id))
        .collect(),
      ctx.db
        .query("rotations")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
    ]);

    const sortedWeeks = sortWeeksByWeekNumber(allWeeks);
    const activeRotations = sortActiveRotations(allRotations);
    const allWeekNumbers = sortedWeeks.map((item) => item.weekNumber);
    const weekNumberByWeekId = getWeekNumberByWeekId(sortedWeeks);
    const candidateWeekNumber = weekNumberByWeekId.get(String(args.weekId));
    if (candidateWeekNumber === undefined) throw new Error("Week is not in the active fiscal year");

    if (nextPhysicianId) {
      const targetPhysician = physician ? [physician] : [];
      const readiness = await getRotationPreferenceReadinessIssues(
        ctx,
        fiscalYear._id,
        targetPhysician,
        activeRotations,
      );
      if (!readiness.rotationConfigurationIssues.isValid || readiness.physicianIssues.length > 0) {
        throw new Error(formatRotationPreferenceGateMessage(readiness));
      }

      const preferencesByPhysicianRotation = await getRotationPreferencesByPhysicianRotation(
        ctx,
        fiscalYear._id,
      );
      const rotationPreference = getRotationPreferenceForPhysicianRotation(
        preferencesByPhysicianRotation,
        nextPhysicianId,
        String(rotation._id),
      );
      if (rotationPreference?.avoid) {
        throw new Error(
          `Cannot assign: ${physician?.initials ?? "Physician"} marked ${rotation.name} as unavailable`,
        );
      }

      const assignedWeekNumbers = getWeekNumbersForRotationByPhysician(
        assignments,
        weekNumberByWeekId,
        String(rotation._id),
        nextPhysicianId,
        String(args.weekId),
      );

      const exceedsConsecutiveWeeks = wouldExceedMaxConsecutiveWeeks({
        allWeekNumbers,
        assignedWeekNumbers,
        candidateWeekNumber,
        maxConsecutiveWeeks: rotation.maxConsecutiveWeeks,
      });

      if (exceedsConsecutiveWeeks) {
        throw new Error(
          `Cannot assign: ${physician?.initials ?? "Physician"} would exceed max consecutive weeks (${rotation.maxConsecutiveWeeks}) for ${rotation.name}`,
        );
      }
    }

    await ctx.db.patch(assignment._id, {
      physicianId: args.physicianId,
      assignedBy: args.physicianId ? (admin.actorPhysicianId ?? undefined) : undefined,
      assignedAt: args.physicianId ? Date.now() : undefined,
    });

    const physicianIdsToCheck = new Set<string>();
    if (currentPhysicianId) physicianIdsToCheck.add(currentPhysicianId);
    if (nextPhysicianId) physicianIdsToCheck.add(nextPhysicianId);

    const activePhysicians = sortActivePhysicians(await ctx.db.query("physicians").collect()).filter((p) =>
      physicianIdsToCheck.has(String(p._id)),
    );

    const cfteSummary = await getCfteSummary({
      ctx,
      fiscalYearId: fiscalYear._id,
      calendarId: draftCalendar._id,
      physicians: activePhysicians,
    });

    const warnings = cfteSummary
      .filter((row) => row.targetCfte !== null && row.totalCfte > row.targetCfte + CFTE_EPSILON)
      .map(
        (row) =>
          `${row.initials} is over cFTE target (${row.totalCfte.toFixed(3)} / ${row.targetCfte!.toFixed(3)})`,
      );

    return {
      message: args.physicianId ? "Assignment saved" : "Assignment cleared",
      warnings,
      cfteSummary,
    };
  },
});

export const autoAssignCurrentFiscalYearDraft = mutation({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const { admin, fiscalYear } = await getAdminAndCurrentFiscalYear(ctx);
    if (!fiscalYear) throw new Error("No active fiscal year available");
    requireBuildingWindow(fiscalYear);

    const draftCalendar = await getDraftCalendarForFiscalYear(ctx, fiscalYear._id);
    if (!draftCalendar) throw new Error("Create a draft calendar before running auto-assign");

    const [weeks, rotations, physicians, assignments] = await Promise.all([
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
        .query("assignments")
        .withIndex("by_calendar", (q) => q.eq("masterCalendarId", draftCalendar._id))
        .collect(),
    ]);

    const sortedWeeks = sortWeeksByWeekNumber(weeks);
    const activeRotations = sortActiveRotations(rotations);
    const activePhysicians = sortActivePhysicians(physicians);
    if (sortedWeeks.length === 0 || activeRotations.length === 0 || activePhysicians.length === 0) {
      return {
        message: "No eligible weeks, rotations, or physicians for auto-assignment",
        assignedCount: 0,
        remainingUnstaffedCount: 0,
      };
    }

    const readiness = await getRotationPreferenceReadinessIssues(
      ctx,
      fiscalYear._id,
      activePhysicians,
      activeRotations,
    );
    if (!readiness.rotationConfigurationIssues.isValid || readiness.physicianIssues.length > 0) {
      throw new Error(formatRotationPreferenceGateMessage(readiness));
    }

    const weekNumberByWeekId = getWeekNumberByWeekId(sortedWeeks);
    const allWeekNumbers = sortedWeeks.map((week) => week.weekNumber);
    const assignmentsByCell = new Map<string, Doc<"assignments">>(
      assignments.map((assignment) => [toCellKey(assignment.weekId, assignment.rotationId), assignment]),
    );

    const rotationsById = new Map<string, Doc<"rotations">>(
      rotations.map((rotation) => [String(rotation._id), rotation]),
    );
    const targetCfteByPhysician = await getTargetCfteByPhysician(ctx, fiscalYear._id);
    const clinicCfteByPhysician = await getClinicCfteByPhysician(ctx, fiscalYear._id);
    const runningRotationCfteByPhysician = getRotationCfteByPhysician(assignments, rotationsById);
    const [availabilityByPhysicianWeek, preferencesByPhysicianRotation] = await Promise.all([
      getAvailabilityByPhysicianWeek(ctx, fiscalYear._id),
      getRotationPreferencesByPhysicianRotation(ctx, fiscalYear._id),
    ]);

    const rotationWeekToPhysician = new Map<string, Map<number, string>>();
    for (const assignment of assignments) {
      if (!assignment.physicianId) continue;
      const rotationId = String(assignment.rotationId);
      const weekNumber = weekNumberByWeekId.get(String(assignment.weekId));
      if (weekNumber === undefined) continue;

      const existing = rotationWeekToPhysician.get(rotationId) ?? new Map<number, string>();
      existing.set(weekNumber, String(assignment.physicianId));
      rotationWeekToPhysician.set(rotationId, existing);
    }

    let assignedCount = 0;

    for (const week of sortedWeeks) {
      for (const rotation of activeRotations) {
        const assignment = assignmentsByCell.get(toCellKey(week._id, rotation._id));
        if (!assignment || assignment.physicianId) continue;

        const candidates = [];
        for (const physician of activePhysicians) {
          const physicianId = String(physician._id);
          const availability = getAvailabilityForPhysicianWeek(
            availabilityByPhysicianWeek,
            physicianId,
            String(week._id),
          );
          if (availability === "red") continue;

          const rotationPreference = getRotationPreferenceForPhysicianRotation(
            preferencesByPhysicianRotation,
            physicianId,
            String(rotation._id),
          );
          if (rotationPreference?.avoid) continue;

          const targetCfte = targetCfteByPhysician.get(physicianId);
          if (targetCfte === undefined) continue;

          const clinicCfte = clinicCfteByPhysician.get(physicianId) ?? 0;
          const rotationCfte = runningRotationCfteByPhysician.get(physicianId) ?? 0;
          const headroom = targetCfte - (clinicCfte + rotationCfte);
          if (headroom + CFTE_EPSILON < rotation.cftePerWeek) continue;

          const rotationWeekMap = rotationWeekToPhysician.get(String(rotation._id)) ?? new Map<number, string>();
          const assignedWeekNumbers = Array.from(rotationWeekMap.entries())
            .filter(([, assignedPhysicianId]) => assignedPhysicianId === physicianId)
            .map(([weekNumber]) => weekNumber);

          const wouldExceed = wouldExceedMaxConsecutiveWeeks({
            allWeekNumbers,
            assignedWeekNumbers,
            candidateWeekNumber: week.weekNumber,
            maxConsecutiveWeeks: rotation.maxConsecutiveWeeks,
          });

          if (wouldExceed) continue;

          candidates.push({
            physicianId,
            availability,
            headroom,
            preferenceRank: rotationPreference?.preferenceRank ?? null,
            deprioritize: rotationPreference?.deprioritize ?? false,
          });
        }

        if (candidates.length === 0) continue;

        const selected = sortCandidatesByAvailabilityAndHeadroom(candidates)[0];
        await ctx.db.patch(assignment._id, {
          physicianId: selected.physicianId as Id<"physicians">,
          assignedBy: admin.actorPhysicianId ?? undefined,
          assignedAt: Date.now(),
        });

        assignment.physicianId = selected.physicianId as Id<"physicians">;
        assignedCount += 1;

        const rotationId = String(rotation._id);
        const weekMap = rotationWeekToPhysician.get(rotationId) ?? new Map<number, string>();
        weekMap.set(week.weekNumber, selected.physicianId);
        rotationWeekToPhysician.set(rotationId, weekMap);

        const previousRotationCfte = runningRotationCfteByPhysician.get(selected.physicianId) ?? 0;
        runningRotationCfteByPhysician.set(selected.physicianId, previousRotationCfte + rotation.cftePerWeek);
      }
    }

    const remainingUnstaffedCount = Array.from(assignmentsByCell.values()).filter(
      (assignment) => !assignment.physicianId,
    ).length;

    return {
      message:
        assignedCount > 0
          ? `Auto-assign complete: filled ${assignedCount} slot(s)`
          : "Auto-assign complete: no eligible assignments found",
      assignedCount,
      remainingUnstaffedCount,
    };
  },
});

export const publishCurrentFiscalYearMasterCalendarDraft = mutation({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const { admin, fiscalYear } = await getAdminAndCurrentFiscalYear(ctx);
    if (!fiscalYear) throw new Error("No active fiscal year available");

    return await publishDraftCalendarForFiscalYear({
      ctx,
      fiscalYear,
      adminId: admin.actorPhysicianId,
    });
  },
});
