import { describe, expect, it } from "vitest";
import {
  buildPhysicianAutoFillWarnings,
  prepareAssignmentsForPhysicianAutoFill,
} from "../convex/lib/physicianAutoFill";

describe("prepareAssignmentsForPhysicianAutoFill", () => {
  it("clears only selected physician auto assignments when replace mode is enabled", () => {
    const { solverAssignments, assignmentIdsToClear } = prepareAssignmentsForPhysicianAutoFill({
      physicianId: "p1",
      replaceExistingAutoAssignments: true,
      assignments: [
        { _id: "a1", weekId: "w1", rotationId: "r1", physicianId: "p1", assignmentSource: "auto" },
        { _id: "a2", weekId: "w2", rotationId: "r1", physicianId: "p1", assignmentSource: "manual" },
        { _id: "a3", weekId: "w3", rotationId: "r1", physicianId: "p2", assignmentSource: "auto" },
      ],
    });

    expect(assignmentIdsToClear).toEqual(["a1"]);
    expect(solverAssignments.find((assignment) => assignment._id === "a1")).toEqual({
      _id: "a1",
      weekId: "w1",
      rotationId: "r1",
      physicianId: null,
      assignmentSource: null,
    });
    expect(solverAssignments.find((assignment) => assignment._id === "a2")?.physicianId).toBe("p1");
  });

  it("preserves other physicians' auto assignments as anchors", () => {
    const { solverAssignments } = prepareAssignmentsForPhysicianAutoFill({
      physicianId: "p1",
      replaceExistingAutoAssignments: true,
      assignments: [
        { _id: "a1", weekId: "w1", rotationId: "r1", physicianId: "p2", assignmentSource: "auto" },
      ],
    });

    expect(solverAssignments[0]).toEqual({
      _id: "a1",
      weekId: "w1",
      rotationId: "r1",
      physicianId: "p2",
      assignmentSource: "manual_anchor",
    });
  });
});

describe("buildPhysicianAutoFillWarnings", () => {
  it("returns warning summary and detailed warning messages", () => {
    const result = buildPhysicianAutoFillWarnings({
      physicianLabel: "Jane Smith (JS)",
      missingRequest: true,
      pendingApproval: true,
      missingRotationNames: ["MICU 1", "PFT"],
    });

    expect(result.summary).toEqual({
      missingRequest: true,
      pendingApproval: true,
      missingRotationPreferenceCount: 2,
    });
    expect(result.warnings.join(" ")).toContain("no schedule request");
    expect(result.warnings.join(" ")).toContain("not admin-approved");
    expect(result.warnings.join(" ")).toContain("MICU 1");
    expect(result.warnings.join(" ")).toContain("PFT");
  });
});
