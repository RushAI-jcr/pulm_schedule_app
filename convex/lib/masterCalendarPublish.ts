import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx } from "../_generated/server";
import {
  getMissingActiveRotationIds,
  getRotationConfigurationIssues,
} from "./rotationPreferenceReadiness";
import { canMapCalendarForFiscalYear } from "./workflowPolicy";
import {
  sortWeeksByWeekNumber,
  sortActiveRotations,
  sortActivePhysicians,
} from "./sorting";

type PhysicianRotationReadinessIssue = {
  physicianId: string;
  initials: string;
  name: string;
  blockingReasons: string[];
};

async function getRotationPreferenceReadinessIssues(
  ctx: MutationCtx,
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

      if (request) {
        const preferences = await ctx.db
          .query("rotationPreferences")
          .withIndex("by_request", (q) => q.eq("scheduleRequestId", request._id))
          .collect();

        const missingRotationIds = getMissingActiveRotationIds({
          activeRotationIds,
          configuredRotationIds: Array.from(
            new Set(preferences.map((preference: Doc<"rotationPreferences">) => String(preference.rotationId))),
          ),
        });
        const missingRotationNames = missingRotationIds
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

export function formatRotationPreferenceGateMessage(args: {
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

export function formatUnstaffedCellError(
  unstaffedCells: Array<{
    weekNumber: number;
    rotationName: string;
  }>,
) {
  if (unstaffedCells.length === 0) return null;

  const sample = unstaffedCells
    .slice(0, 6)
    .map((cell) => `Week ${cell.weekNumber} ${cell.rotationName}`)
    .join(", ");
  const suffix = unstaffedCells.length > 6 ? ` +${unstaffedCells.length - 6} more` : "";

  return `Cannot publish: ${unstaffedCells.length} unstaffed rotation slot(s) remain. Fill all required week/rotation cells first. Example gaps: ${sample}${suffix}`;
}

export async function publishDraftCalendarForFiscalYear(args: {
  ctx: MutationCtx;
  fiscalYear: Pick<Doc<"fiscalYears">, "_id" | "label" | "status">;
  adminId: Id<"physicians"> | null;
}) {
  const { ctx, fiscalYear, adminId } = args;

  if (!canMapCalendarForFiscalYear(fiscalYear.status)) {
    throw new Error("Calendar mapping is only available while fiscal year is building");
  }

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

  const existingPublished = calendars
    .filter((calendar) => calendar.status === "published")
    .sort((a, b) => b.version - a.version)[0];
  if (existingPublished) {
    throw new Error(`Fiscal year ${fiscalYear.label} already has a published master calendar`);
  }

  const draftCalendar = calendars
    .filter((calendar) => calendar.status === "draft")
    .sort((a, b) => b.version - a.version)[0];
  if (!draftCalendar) {
    throw new Error("Create a draft calendar before publishing");
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

  const assignments = await ctx.db
    .query("assignments")
    .withIndex("by_calendar", (q) => q.eq("masterCalendarId", draftCalendar._id))
    .collect();
  const assignmentByCellKey = new Map(
    assignments.map((assignment) => [
      `${String(assignment.weekId)}:${String(assignment.rotationId)}`,
      assignment,
    ]),
  );

  const unstaffedCells: Array<{ weekNumber: number; rotationName: string }> = [];
  for (const week of sortedWeeks) {
    for (const rotation of activeRotations) {
      const assignment = assignmentByCellKey.get(`${String(week._id)}:${String(rotation._id)}`);
      if (!assignment || !assignment.physicianId) {
        unstaffedCells.push({
          weekNumber: week.weekNumber,
          rotationName: rotation.name,
        });
      }
    }
  }

  const unstaffedError = formatUnstaffedCellError(unstaffedCells);
  if (unstaffedError) {
    throw new Error(unstaffedError);
  }

  const publishedAt = Date.now();

  await ctx.db.patch(draftCalendar._id, {
    status: "published",
    publishedAt,
  });
  await ctx.db.patch(fiscalYear._id, {
    status: "published",
  });

  return {
    message: "Master calendar published",
    calendarId: draftCalendar._id,
    publishedAt,
    publishedBy: adminId,
  };
}
