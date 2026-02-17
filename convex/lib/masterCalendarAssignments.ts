export type Availability = "green" | "yellow" | "red";

export interface CandidateForAssignment {
  physicianId: string;
  availability: Availability;
  headroom: number;
}

export function getAvailabilityPriority(availability: Availability): number {
  if (availability === "green") return 0;
  if (availability === "yellow") return 1;
  return 2;
}

export function sortCandidatesByAvailabilityAndHeadroom<T extends CandidateForAssignment>(
  candidates: T[],
): T[] {
  return [...candidates].sort((a, b) => {
    const availabilityDiff = getAvailabilityPriority(a.availability) - getAvailabilityPriority(b.availability);
    if (availabilityDiff !== 0) return availabilityDiff;

    const headroomDiff = b.headroom - a.headroom;
    if (headroomDiff !== 0) return headroomDiff;

    return a.physicianId.localeCompare(b.physicianId);
  });
}

export function wouldExceedMaxConsecutiveWeeks({
  allWeekNumbers,
  assignedWeekNumbers,
  candidateWeekNumber,
  maxConsecutiveWeeks,
}: {
  allWeekNumbers: number[];
  assignedWeekNumbers: number[];
  candidateWeekNumber: number;
  maxConsecutiveWeeks: number;
}): boolean {
  if (maxConsecutiveWeeks <= 0) return false;

  const assigned = new Set<number>(assignedWeekNumbers);
  assigned.add(candidateWeekNumber);

  const normalizedWeeks = [...new Set(allWeekNumbers)].sort((a, b) => a - b);

  let longestStreak = 0;
  let currentStreak = 0;
  let lastWeekNumber: number | null = null;

  for (const weekNumber of normalizedWeeks) {
    if (!assigned.has(weekNumber)) {
      currentStreak = 0;
      lastWeekNumber = null;
      continue;
    }

    if (lastWeekNumber !== null && weekNumber === lastWeekNumber + 1) {
      currentStreak += 1;
    } else {
      currentStreak = 1;
    }

    lastWeekNumber = weekNumber;
    if (currentStreak > longestStreak) longestStreak = currentStreak;
  }

  return longestStreak > maxConsecutiveWeeks;
}

export function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
