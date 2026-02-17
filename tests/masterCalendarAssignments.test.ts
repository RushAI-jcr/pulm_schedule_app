import { describe, expect, it } from "vitest";
import {
  round4,
  sortCandidatesByAvailabilityAndHeadroom,
  wouldExceedMaxConsecutiveWeeks,
} from "../convex/lib/masterCalendarAssignments";

describe("master calendar assignment helpers", () => {
  it("sorts candidates by availability first then headroom", () => {
    const sorted = sortCandidatesByAvailabilityAndHeadroom([
      { physicianId: "p3", availability: "yellow", headroom: 0.7 },
      { physicianId: "p1", availability: "green", headroom: 0.1 },
      { physicianId: "p2", availability: "green", headroom: 0.5 },
      { physicianId: "p4", availability: "yellow", headroom: 0.9 },
    ]);

    expect(sorted.map((candidate) => candidate.physicianId)).toEqual(["p2", "p1", "p4", "p3"]);
  });

  it("detects streaks that would exceed max consecutive weeks", () => {
    expect(
      wouldExceedMaxConsecutiveWeeks({
        allWeekNumbers: [1, 2, 3, 4, 5],
        assignedWeekNumbers: [1, 2],
        candidateWeekNumber: 3,
        maxConsecutiveWeeks: 2,
      }),
    ).toBe(true);
  });

  it("allows non-adjacent assignments under max consecutive limit", () => {
    expect(
      wouldExceedMaxConsecutiveWeeks({
        allWeekNumbers: [1, 2, 3, 4, 5],
        assignedWeekNumbers: [1, 3],
        candidateWeekNumber: 5,
        maxConsecutiveWeeks: 2,
      }),
    ).toBe(false);
  });

  it("rounds to 4 decimals", () => {
    expect(round4(0.123456)).toBe(0.1235);
  });
});
