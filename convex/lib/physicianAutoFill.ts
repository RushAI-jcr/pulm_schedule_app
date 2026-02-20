export type ExistingAssignmentLike = {
  _id: string;
  weekId: string;
  rotationId: string;
  physicianId: string | null | undefined;
  assignmentSource?: string | null;
};

export function prepareAssignmentsForPhysicianAutoFill(args: {
  assignments: ExistingAssignmentLike[];
  physicianId: string;
  replaceExistingAutoAssignments: boolean;
}) {
  const assignmentIdsToClear: string[] = [];

  const solverAssignments = args.assignments.map((assignment) => {
    const assignedToSelected = assignment.physicianId === args.physicianId;
    const isAuto = assignment.assignmentSource === "auto";

    if (assignedToSelected && isAuto && args.replaceExistingAutoAssignments) {
      assignmentIdsToClear.push(assignment._id);
      return {
        ...assignment,
        physicianId: null,
        assignmentSource: null,
      };
    }

    if (!assignedToSelected && assignment.physicianId && isAuto) {
      return {
        ...assignment,
        assignmentSource: "manual_anchor",
      };
    }

    return assignment;
  });

  return {
    solverAssignments,
    assignmentIdsToClear,
  };
}

export function buildPhysicianAutoFillWarnings(args: {
  physicianLabel: string;
  missingRequest: boolean;
  pendingApproval: boolean;
  missingRotationNames: string[];
}) {
  const warnings: string[] = [];
  if (args.missingRequest) {
    warnings.push(
      `${args.physicianLabel} has no schedule request for this fiscal year. Missing rotation preferences are treated as willing.`,
    );
  }
  if (args.pendingApproval) {
    warnings.push(
      `${args.physicianLabel} rotation preferences are not admin-approved. Auto-fill proceeds in physician mode with caution.`,
    );
  }
  if (args.missingRotationNames.length > 0) {
    warnings.push(
      `${args.physicianLabel} is missing explicit preferences for: ${args.missingRotationNames.join(", ")}.`,
    );
  }

  return {
    warnings,
    summary: {
      missingRequest: args.missingRequest,
      pendingApproval: args.pendingApproval,
      missingRotationPreferenceCount: args.missingRotationNames.length,
    },
  };
}
