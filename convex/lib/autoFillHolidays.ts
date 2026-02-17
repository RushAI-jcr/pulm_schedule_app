// ========================================
// Holiday identification and prior-year parity
// ========================================

interface CalendarEvent {
  weekId: string;
  name: string;
  category: string;
  isApproved: boolean;
}

/**
 * Build a map of weekId -> holidayName[] for all approved federal holidays
 * in the given fiscal year. Only includes holidays that match the
 * configured major holiday names.
 */
export function identifyHolidayWeeks(
  calendarEvents: CalendarEvent[],
  majorHolidayNames: string[],
): Map<string, string[]> {
  const majorSet = new Set(
    majorHolidayNames.map((n) => n.toLowerCase()),
  );
  const map = new Map<string, string[]>();

  for (const event of calendarEvents) {
    if (!event.isApproved) continue;
    if (event.category !== "federal_holiday") continue;
    if (!majorSet.has(event.name.toLowerCase())) continue;

    const existing = map.get(event.weekId) ?? [];
    existing.push(event.name);
    map.set(event.weekId, existing);
  }

  return map;
}

/**
 * Build a map of all approved federal holidays (any category) per week.
 * Used for general holiday awareness (not just major holidays).
 */
export function identifyAllHolidayWeeks(
  calendarEvents: CalendarEvent[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const event of calendarEvents) {
    if (!event.isApproved) continue;
    if (event.category !== "federal_holiday") continue;

    const existing = map.get(event.weekId) ?? [];
    existing.push(event.name);
    map.set(event.weekId, existing);
  }

  return map;
}

interface PriorYearAssignment {
  weekId: string;
  physicianId: string | null | undefined;
}

/**
 * Given prior FY's published calendar assignments and the holiday weeks
 * in that prior FY, build a map of holidayName -> physicianId[] showing
 * which physicians worked each major holiday last year.
 */
export function buildPriorYearHolidayMap(
  priorAssignments: PriorYearAssignment[],
  priorHolidayWeeks: Map<string, string[]>,
): Map<string, string[]> {
  const result = new Map<string, string[]>();

  // Build weekId -> physicianIds for prior year assignments
  const weekPhysicians = new Map<string, Set<string>>();
  for (const a of priorAssignments) {
    if (!a.physicianId) continue;
    let set = weekPhysicians.get(a.weekId);
    if (!set) {
      set = new Set<string>();
      weekPhysicians.set(a.weekId, set);
    }
    set.add(a.physicianId);
  }

  // For each holiday week in the prior year, collect who worked
  for (const [weekId, holidayNames] of priorHolidayWeeks) {
    const physicians = weekPhysicians.get(weekId);
    if (!physicians) continue;

    for (const holidayName of holidayNames) {
      const normalizedName = holidayName.toLowerCase();
      const existing = result.get(normalizedName) ?? [];
      for (const pid of physicians) {
        if (!existing.includes(pid)) {
          existing.push(pid);
        }
      }
      result.set(normalizedName, existing);
    }
  }

  return result;
}

/**
 * Compute holiday parity scores for each physician for each major holiday.
 *
 * Logic:
 * - If physician worked this holiday last year: large penalty (-50)
 * - If physician worked a *different* major holiday last year: bonus (+30)
 * - If physician worked neither: neutral (0)
 * - If no prior year data: all physicians start at 0
 *
 * Returns Map<physicianId, Map<normalizedHolidayName, parityScore>>
 */
export function computeHolidayParityScores(params: {
  majorHolidayNames: string[];
  priorYearHolidayAssignments: Map<string, string[]>;
  currentYearCandidates: string[];
}): Map<string, Map<string, number>> {
  const { majorHolidayNames, priorYearHolidayAssignments, currentYearCandidates } = params;

  const result = new Map<string, Map<string, number>>();

  // If no prior year data, everyone starts at 0
  if (priorYearHolidayAssignments.size === 0) {
    for (const pid of currentYearCandidates) {
      const scores = new Map<string, number>();
      for (const h of majorHolidayNames) {
        scores.set(h.toLowerCase(), 0);
      }
      result.set(pid, scores);
    }
    return result;
  }

  // Build a set of which holidays each physician worked last year
  const physicianPriorHolidays = new Map<string, Set<string>>();
  for (const [holidayName, physicianIds] of priorYearHolidayAssignments) {
    for (const pid of physicianIds) {
      let holidays = physicianPriorHolidays.get(pid);
      if (!holidays) {
        holidays = new Set<string>();
        physicianPriorHolidays.set(pid, holidays);
      }
      holidays.add(holidayName);
    }
  }

  const normalizedMajorHolidays = majorHolidayNames.map((n) => n.toLowerCase());

  for (const pid of currentYearCandidates) {
    const scores = new Map<string, number>();
    const workedLastYear = physicianPriorHolidays.get(pid) ?? new Set<string>();

    for (const holiday of normalizedMajorHolidays) {
      if (workedLastYear.has(holiday)) {
        // Worked this specific holiday last year -> penalty
        scores.set(holiday, -50);
      } else if (workedLastYear.size > 0) {
        // Worked a different major holiday last year -> bonus
        scores.set(holiday, 30);
      } else {
        // Didn't work any major holiday last year -> neutral
        scores.set(holiday, 0);
      }
    }

    result.set(pid, scores);
  }

  return result;
}
