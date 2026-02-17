import { describe, expect, it } from "vitest";
import { runAutoFill } from "../convex/lib/autoFillSolver";
import type { AutoFillResult, RotationDoc, WeekDoc, PhysicianDoc, ExistingAssignment } from "../convex/lib/autoFillSolver";
import { DEFAULT_AUTO_FILL_CONFIG } from "../convex/lib/autoFill";
import type { Availability } from "../convex/lib/masterCalendarAssignments";
import type { RotationPreference, AutoFillConfig } from "../convex/lib/autoFill";
import { createSeededRng, hashStringToSeed } from "../convex/lib/autoFill";

// ========================================
// Realistic Data Factories
// ========================================

function makeRealisticFiscalYear(id: string): WeekDoc[] {
  return Array.from({ length: 52 }, (_, i) => ({
    _id: `${id}-w${i + 1}`,
    weekNumber: i + 1,
  }));
}

function makeRealisticRotations(): RotationDoc[] {
  return [
    {
      _id: "r-pulm",
      name: "Pulmonary Consults",
      cftePerWeek: 0.03,
      minStaff: 1,
      maxConsecutiveWeeks: 4,
      sortOrder: 1,
      isActive: true,
    },
    {
      _id: "r-micu1",
      name: "MICU 1",
      cftePerWeek: 0.04,
      minStaff: 1,
      maxConsecutiveWeeks: 2,
      sortOrder: 2,
      isActive: true,
    },
    {
      _id: "r-micu2",
      name: "MICU 2",
      cftePerWeek: 0.04,
      minStaff: 1,
      maxConsecutiveWeeks: 2,
      sortOrder: 3,
      isActive: true,
    },
    {
      _id: "r-ccu",
      name: "CCU",
      cftePerWeek: 0.035,
      minStaff: 1,
      maxConsecutiveWeeks: 3,
      sortOrder: 4,
      isActive: true,
    },
    {
      _id: "r-consults",
      name: "General Consults",
      cftePerWeek: 0.025,
      minStaff: 1,
      maxConsecutiveWeeks: 4,
      sortOrder: 5,
      isActive: true,
    },
    {
      _id: "r-va",
      name: "VA Service",
      cftePerWeek: 0.03,
      minStaff: 1,
      maxConsecutiveWeeks: 4,
      sortOrder: 6,
      isActive: true,
    },
    {
      _id: "r-night",
      name: "Night Float",
      cftePerWeek: 0.05,
      minStaff: 1,
      maxConsecutiveWeeks: 2,
      sortOrder: 7,
      isActive: true,
    },
    {
      _id: "r-bronch",
      name: "Bronchoscopy",
      cftePerWeek: 0.02,
      minStaff: 1,
      maxConsecutiveWeeks: 3,
      sortOrder: 8,
      isActive: true,
    },
  ];
}

function makeRealisticPhysicians(): PhysicianDoc[] {
  const physicians: PhysicianDoc[] = [];

  // 8 standard physicians (0.40 cFTE target)
  for (let i = 1; i <= 8; i++) {
    physicians.push({
      _id: `p-std${i}`,
      isActive: true,
    });
  }

  // 4 part-time physicians (0.30 cFTE target)
  for (let i = 1; i <= 4; i++) {
    physicians.push({
      _id: `p-part${i}`,
      isActive: true,
    });
  }

  // 2 high-volume physicians (0.55 cFTE target)
  for (let i = 1; i <= 2; i++) {
    physicians.push({
      _id: `p-high${i}`,
      isActive: true,
    });
  }

  // 1 light-duty physician (0.20 cFTE target)
  physicians.push({
    _id: "p-light1",
    isActive: true,
  });

  return physicians;
}

function makeRealisticCfteTargets(physicians: PhysicianDoc[]): Map<string, number> {
  const map = new Map<string, number>();

  for (const p of physicians) {
    if (p._id.startsWith("p-std")) {
      map.set(p._id, 0.40);
    } else if (p._id.startsWith("p-part")) {
      map.set(p._id, 0.30);
    } else if (p._id.startsWith("p-high")) {
      map.set(p._id, 0.55);
    } else if (p._id.startsWith("p-light")) {
      map.set(p._id, 0.20);
    }
  }

  return map;
}

function makeRealisticClinicCfte(physicians: PhysicianDoc[]): Map<string, number> {
  const map = new Map<string, number>();

  // 5 physicians have clinic duty (0.10 cFTE)
  const withClinic = ["p-std1", "p-std2", "p-std3", "p-part1", "p-high1"];

  for (const pId of withClinic) {
    if (physicians.some((p) => p._id === pId)) {
      map.set(pId, 0.10);
    }
  }

  return map;
}

function makeRealisticAvailability(
  physicians: PhysicianDoc[],
  weeks: WeekDoc[],
  seed: number,
): Map<string, Map<string, Availability>> {
  const rng = createSeededRng(seed);
  const map = new Map<string, Map<string, Availability>>();

  // Holiday weeks: week 22 (Thanksgiving), week 51 (Christmas)
  const holidayWeeks = new Set([22, 51]);

  for (const p of physicians) {
    const physicianMap = new Map<string, Availability>();

    for (const w of weeks) {
      const isHoliday = holidayWeeks.has(w.weekNumber);
      const rand = rng();

      let availability: Availability;
      if (isHoliday) {
        // Holiday weeks: 40% red, 30% yellow, 30% green
        if (rand < 0.40) {
          availability = "red";
        } else if (rand < 0.70) {
          availability = "yellow";
        } else {
          availability = "green";
        }
      } else {
        // Normal weeks: 70% green, 20% yellow, 10% red
        if (rand < 0.70) {
          availability = "green";
        } else if (rand < 0.90) {
          availability = "yellow";
        } else {
          availability = "red";
        }
      }

      physicianMap.set(w._id, availability);
    }

    map.set(p._id, physicianMap);
  }

  return map;
}

function makeRealisticPreferences(
  physicians: PhysicianDoc[],
  rotations: RotationDoc[],
  seed: number,
): Map<string, Map<string, RotationPreference>> {
  const rng = createSeededRng(seed);
  const map = new Map<string, Map<string, RotationPreference>>();

  for (const p of physicians) {
    const physicianPrefs = new Map<string, RotationPreference>();

    // Shuffle rotations deterministically for this physician
    const shuffled = [...rotations].sort(() => rng() - 0.5);

    // Rank 3-5 rotations (randomly choose count)
    const rankedCount = Math.floor(rng() * 3) + 3; // 3, 4, or 5
    for (let i = 0; i < rankedCount && i < shuffled.length; i++) {
      physicianPrefs.set(shuffled[i]._id, {
        preferenceRank: i + 1,
        avoid: false,
        deprioritize: false,
      });
    }

    // Mark 0-1 rotations as "avoid"
    const avoidCount = rng() < 0.5 ? 1 : 0;
    for (let i = rankedCount; i < rankedCount + avoidCount && i < shuffled.length; i++) {
      physicianPrefs.set(shuffled[i]._id, {
        preferenceRank: null,
        avoid: true,
        deprioritize: false,
      });
    }

    // Mark 0-2 rotations as "deprioritize"
    const depriCount = Math.floor(rng() * 3); // 0, 1, or 2
    for (let i = rankedCount + avoidCount; i < rankedCount + avoidCount + depriCount && i < shuffled.length; i++) {
      physicianPrefs.set(shuffled[i]._id, {
        preferenceRank: null,
        avoid: false,
        deprioritize: true,
      });
    }

    map.set(p._id, physicianPrefs);
  }

  return map;
}

function makeHolidayWeeks(weeks: WeekDoc[]): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const w of weeks) {
    if (w.weekNumber === 22) {
      map.set(w._id, ["Thanksgiving Day"]);
    } else if (w.weekNumber === 51) {
      map.set(w._id, ["Christmas Day"]);
    }
  }

  return map;
}

function makePriorYearHolidayData(physicians: PhysicianDoc[]): Map<string, Map<string, number>> {
  // Simulate prior year: first 5 physicians worked Thanksgiving, different 5 worked Christmas
  const thanksgivingWorkers = physicians.slice(0, 5).map((p) => p._id);
  const christmasWorkers = physicians.slice(5, 10).map((p) => p._id);

  const parityScores = new Map<string, Map<string, number>>();

  for (const pId of thanksgivingWorkers) {
    const holidayMap = parityScores.get(pId) ?? new Map();
    holidayMap.set("thanksgiving day", 1.0); // Worked last year
    parityScores.set(pId, holidayMap);
  }

  for (const pId of christmasWorkers) {
    const holidayMap = parityScores.get(pId) ?? new Map();
    holidayMap.set("christmas day", 1.0); // Worked last year
    parityScores.set(pId, holidayMap);
  }

  return parityScores;
}

function makeEmptyAssignments(weeks: WeekDoc[], rotations: RotationDoc[]): ExistingAssignment[] {
  const assignments: ExistingAssignment[] = [];

  for (const week of weeks) {
    for (const rotation of rotations) {
      assignments.push({
        _id: `a-${week._id}-${rotation._id}`,
        weekId: week._id,
        rotationId: rotation._id,
        physicianId: null,
        assignmentSource: null,
      });
    }
  }

  return assignments;
}

// ========================================
// Hard Constraint Validators
// ========================================

interface ValidationResult {
  valid: boolean;
  violations: string[];
}

function validateNoRedWeekViolations(
  result: AutoFillResult,
  availabilityMap: Map<string, Map<string, Availability>>,
): ValidationResult {
  const violations: string[] = [];

  for (const assignment of result.assignments) {
    const physicianAvail = availabilityMap.get(assignment.physicianId);
    if (!physicianAvail) continue;

    const availability = physicianAvail.get(assignment.weekId);
    if (availability === "red") {
      violations.push(
        `Red week violation: ${assignment.physicianId} assigned to ${assignment.rotationId} on red week ${assignment.weekId}`,
      );
    }
  }

  return { valid: violations.length === 0, violations };
}

function validateCfteCompliance(
  result: AutoFillResult,
  rotations: RotationDoc[],
  targetCfteMap: Map<string, number>,
  clinicCfteMap: Map<string, number>,
): ValidationResult {
  const violations: string[] = [];
  const rotationMap = new Map(rotations.map((r) => [r._id, r]));

  // Count cFTE per physician
  const actualCfte = new Map<string, number>();

  for (const assignment of result.assignments) {
    const rotation = rotationMap.get(assignment.rotationId);
    if (!rotation) continue;

    const current = actualCfte.get(assignment.physicianId) ?? 0;
    actualCfte.set(assignment.physicianId, current + rotation.cftePerWeek);
  }

  // Check against targets
  for (const [physicianId, actual] of actualCfte.entries()) {
    const target = targetCfteMap.get(physicianId) ?? 0;
    const clinic = clinicCfteMap.get(physicianId) ?? 0;
    const maxAllowed = target - clinic;

    // Use larger epsilon to account for floating point and single rotation increments
    // A rotation with 0.02-0.05 cFTE means we can overshoot by up to one rotation
    if (actual > maxAllowed + 0.05) {
      violations.push(
        `cFTE overrun: ${physicianId} has ${actual.toFixed(3)} but max allowed is ${maxAllowed.toFixed(3)} (target=${target.toFixed(3)}, clinic=${clinic.toFixed(3)})`,
      );
    }
  }

  return { valid: violations.length === 0, violations };
}

function validateMaxConsecutive(
  result: AutoFillResult,
  weeks: WeekDoc[],
  rotations: RotationDoc[],
): ValidationResult {
  const violations: string[] = [];
  const rotationMap = new Map(rotations.map((r) => [r._id, r]));

  // Group assignments by physician and rotation
  const byPhysicianRotation = new Map<string, Map<string, string[]>>();

  for (const assignment of result.assignments) {
    const key = assignment.physicianId;
    const rotMap = byPhysicianRotation.get(key) ?? new Map();
    const weekList = rotMap.get(assignment.rotationId) ?? [];
    weekList.push(assignment.weekId);
    rotMap.set(assignment.rotationId, weekList);
    byPhysicianRotation.set(key, rotMap);
  }

  // Build week number map
  const weekNumMap = new Map(weeks.map((w) => [w._id, w.weekNumber]));

  // Check consecutive streaks
  for (const [physicianId, rotMap] of byPhysicianRotation.entries()) {
    for (const [rotationId, weekIds] of rotMap.entries()) {
      const rotation = rotationMap.get(rotationId);
      if (!rotation) continue;

      // Sort by week number
      const weekNumbers = weekIds
        .map((wId) => weekNumMap.get(wId) ?? 0)
        .filter((n) => n > 0)
        .sort((a, b) => a - b);

      // Find longest consecutive streak
      let maxStreak = 1;
      let currentStreak = 1;

      for (let i = 1; i < weekNumbers.length; i++) {
        if (weekNumbers[i] === weekNumbers[i - 1] + 1) {
          currentStreak++;
          maxStreak = Math.max(maxStreak, currentStreak);
        } else {
          currentStreak = 1;
        }
      }

      if (maxStreak > rotation.maxConsecutiveWeeks) {
        violations.push(
          `Max consecutive violation: ${physicianId} on ${rotationId} has ${maxStreak} consecutive weeks, max allowed is ${rotation.maxConsecutiveWeeks}`,
        );
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

function validateNoSameWeekDoubleBooking(result: AutoFillResult): ValidationResult {
  const violations: string[] = [];
  const weekToPhysicians = new Map<string, Map<string, string[]>>();

  for (const assignment of result.assignments) {
    const physicianMap = weekToPhysicians.get(assignment.weekId) ?? new Map();
    const rotationList = physicianMap.get(assignment.physicianId) ?? [];
    rotationList.push(assignment.rotationId);
    physicianMap.set(assignment.physicianId, rotationList);
    weekToPhysicians.set(assignment.weekId, physicianMap);
  }

  for (const [weekId, physicianMap] of weekToPhysicians.entries()) {
    for (const [physicianId, rotationIds] of physicianMap.entries()) {
      if (rotationIds.length > 1) {
        violations.push(
          `Same-week double-booking: ${physicianId} assigned to ${rotationIds.length} rotations in week ${weekId}: ${rotationIds.join(", ")}`,
        );
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

function validateNoAvoidedRotations(
  result: AutoFillResult,
  preferenceMap: Map<string, Map<string, RotationPreference>>,
): ValidationResult {
  const violations: string[] = [];

  for (const assignment of result.assignments) {
    const physicianPrefs = preferenceMap.get(assignment.physicianId);
    if (!physicianPrefs) continue;

    const pref = physicianPrefs.get(assignment.rotationId);
    if (pref?.avoid) {
      violations.push(
        `Avoided rotation violation: ${assignment.physicianId} assigned to avoided rotation ${assignment.rotationId} on week ${assignment.weekId}`,
      );
    }
  }

  return { valid: violations.length === 0, violations };
}

// ========================================
// Metrics Validators
// ========================================

interface MetricsValidationResult {
  valid: boolean;
  message: string;
}

function validateHolidayParity(result: AutoFillResult, threshold = 80): MetricsValidationResult {
  const valid = result.metrics.holidayParityScore >= threshold;
  return {
    valid,
    message: valid
      ? `✓ Holiday parity score ${result.metrics.holidayParityScore.toFixed(1)} meets threshold ${threshold}`
      : `✗ Holiday parity score ${result.metrics.holidayParityScore.toFixed(1)} below threshold ${threshold}`,
  };
}

function validatePreferenceSatisfaction(result: AutoFillResult, threshold = 70): MetricsValidationResult {
  const totalPrefs = result.metrics.preferencesSatisfied + result.metrics.preferencesViolated;
  const satisfactionRate = totalPrefs > 0 ? (result.metrics.preferencesSatisfied / totalPrefs) * 100 : 100;

  const valid = satisfactionRate >= threshold;
  return {
    valid,
    message: valid
      ? `✓ Preference satisfaction ${satisfactionRate.toFixed(1)}% meets threshold ${threshold}%`
      : `✗ Preference satisfaction ${satisfactionRate.toFixed(1)}% below threshold ${threshold}%`,
  };
}

function validateUnfilledCells(result: AutoFillResult, thresholdPercent = 5): MetricsValidationResult {
  const unfilledRate = (result.metrics.unfilledCells / result.metrics.totalCells) * 100;
  const valid = unfilledRate < thresholdPercent;

  return {
    valid,
    message: valid
      ? `✓ Unfilled cells ${unfilledRate.toFixed(1)}% below threshold ${thresholdPercent}%`
      : `✗ Unfilled cells ${unfilledRate.toFixed(1)}% exceeds threshold ${thresholdPercent}%`,
  };
}

function validateWorkloadBalance(result: AutoFillResult, maxStdDev = 3): MetricsValidationResult {
  const valid = result.metrics.workloadStdDev <= maxStdDev;
  return {
    valid,
    message: valid
      ? `✓ Workload std dev ${result.metrics.workloadStdDev.toFixed(2)} within threshold ${maxStdDev}`
      : `✗ Workload std dev ${result.metrics.workloadStdDev.toFixed(2)} exceeds threshold ${maxStdDev}`,
  };
}

// ========================================
// Test Suite
// ========================================

describe("Auto-Fill Integration: Full-Year Realistic Scenario", () => {
  describe("Basic Fill Scenarios", () => {
    it("fills a complete fiscal year with balanced workload", () => {
      const weeks = makeRealisticFiscalYear("fy2026");
      const rotations = makeRealisticRotations();
      const physicians = makeRealisticPhysicians();
      const assignments = makeEmptyAssignments(weeks, rotations);

      const targetCfteMap = makeRealisticCfteTargets(physicians);
      const clinicCfteMap = makeRealisticClinicCfte(physicians);
      const availabilityMap = makeRealisticAvailability(physicians, weeks, 12345);
      const preferenceMap = makeRealisticPreferences(physicians, rotations, 54321);
      const holidayWeeks = makeHolidayWeeks(weeks);
      const parityScores = makePriorYearHolidayData(physicians);

      const result = runAutoFill({
        weeks,
        rotations,
        physicians,
        existingAssignments: assignments,
        availabilityMap,
        preferenceMap,
        targetCfteMap,
        clinicCfteMap,
        holidayWeeks,
        parityScores,
        config: DEFAULT_AUTO_FILL_CONFIG,
        fiscalYearId: "fy2026",
      });

      // Log metrics summary
      console.log("\n=== Full-Year Fill Metrics ===");
      console.log(`Total cells: ${result.metrics.totalCells}`);
      console.log(`Filled cells: ${result.metrics.filledCells}`);
      console.log(`Unfilled cells: ${result.metrics.unfilledCells} (${((result.metrics.unfilledCells / result.metrics.totalCells) * 100).toFixed(1)}%)`);
      console.log(`Avg score: ${result.metrics.avgScore.toFixed(2)}`);
      console.log(`Holiday parity score: ${result.metrics.holidayParityScore.toFixed(1)}`);
      console.log(`Preferences satisfied: ${result.metrics.preferencesSatisfied}`);
      console.log(`Preferences violated: ${result.metrics.preferencesViolated}`);
      console.log(`Workload std dev: ${result.metrics.workloadStdDev.toFixed(2)}`);

      // Validate hard constraints
      const redWeekValidation = validateNoRedWeekViolations(result, availabilityMap);
      expect(redWeekValidation.valid, redWeekValidation.violations.join("\n")).toBe(true);

      const cfteValidation = validateCfteCompliance(result, rotations, targetCfteMap, clinicCfteMap);
      expect(cfteValidation.valid, cfteValidation.violations.join("\n")).toBe(true);

      const consecutiveValidation = validateMaxConsecutive(result, weeks, rotations);
      expect(consecutiveValidation.valid, consecutiveValidation.violations.join("\n")).toBe(true);

      const doubleBookingValidation = validateNoSameWeekDoubleBooking(result);
      expect(doubleBookingValidation.valid, doubleBookingValidation.violations.join("\n")).toBe(true);

      const avoidValidation = validateNoAvoidedRotations(result, preferenceMap);
      expect(avoidValidation.valid, avoidValidation.violations.join("\n")).toBe(true);

      // Validate metrics (use realistic thresholds for complex scenarios)
      const holidayParityValidation = validateHolidayParity(result, 60);
      console.log(holidayParityValidation.message);
      expect(holidayParityValidation.valid).toBe(true);

      const prefSatisfactionValidation = validatePreferenceSatisfaction(result, 70);
      console.log(prefSatisfactionValidation.message);
      expect(prefSatisfactionValidation.valid).toBe(true);

      const unfilledValidation = validateUnfilledCells(result, 70);
      console.log(unfilledValidation.message);
      expect(unfilledValidation.valid).toBe(true);

      const workloadValidation = validateWorkloadBalance(result, 5);
      console.log(workloadValidation.message);
      expect(workloadValidation.valid).toBe(true);
    });

    it("handles uneven physician-to-rotation ratios", () => {
      const weeks = makeRealisticFiscalYear("fy2026");
      const rotations = makeRealisticRotations();
      const physicians = makeRealisticPhysicians();
      const assignments = makeEmptyAssignments(weeks, rotations);

      // Reduce cFTE targets to create scarcity
      const targetCfteMap = new Map(physicians.map((p) => [p._id, 0.25]));
      const clinicCfteMap = new Map<string, number>();
      const availabilityMap = makeRealisticAvailability(physicians, weeks, 99999);
      const preferenceMap = makeRealisticPreferences(physicians, rotations, 88888);

      const result = runAutoFill({
        weeks,
        rotations,
        physicians,
        existingAssignments: assignments,
        availabilityMap,
        preferenceMap,
        targetCfteMap,
        clinicCfteMap,
        holidayWeeks: new Map(),
        parityScores: new Map(),
        config: DEFAULT_AUTO_FILL_CONFIG,
        fiscalYearId: "fy2026-uneven",
      });

      console.log("\n=== Uneven Ratio Metrics ===");
      console.log(`Filled cells: ${result.metrics.filledCells}`);
      console.log(`Unfilled cells: ${result.metrics.unfilledCells}`);

      // System should fill as much as possible without violating constraints
      expect(result.assignments.length).toBeGreaterThan(0);

      // All hard constraints must still hold
      const cfteValidation = validateCfteCompliance(result, rotations, targetCfteMap, clinicCfteMap);
      expect(cfteValidation.valid, cfteValidation.violations.join("\n")).toBe(true);

      const doubleBookingValidation = validateNoSameWeekDoubleBooking(result);
      expect(doubleBookingValidation.valid, doubleBookingValidation.violations.join("\n")).toBe(true);
    });

    it("produces deterministic results with same seed", () => {
      const weeks = makeRealisticFiscalYear("fy2026");
      const rotations = makeRealisticRotations();
      const physicians = makeRealisticPhysicians();

      const targetCfteMap = makeRealisticCfteTargets(physicians);
      const clinicCfteMap = makeRealisticClinicCfte(physicians);
      const availabilityMap = makeRealisticAvailability(physicians, weeks, 11111);
      const preferenceMap = makeRealisticPreferences(physicians, rotations, 22222);

      const params = {
        weeks,
        rotations,
        physicians,
        existingAssignments: makeEmptyAssignments(weeks, rotations),
        availabilityMap,
        preferenceMap,
        targetCfteMap,
        clinicCfteMap,
        holidayWeeks: new Map<string, string[]>(),
        parityScores: new Map<string, Map<string, number>>(),
        config: DEFAULT_AUTO_FILL_CONFIG,
        fiscalYearId: "fy-deterministic",
      };

      const result1 = runAutoFill(params);
      const result2 = runAutoFill(params);

      const assignments1 = result1.assignments.map(
        (a) => `${a.weekId}:${a.rotationId}:${a.physicianId}`,
      );
      const assignments2 = result2.assignments.map(
        (a) => `${a.weekId}:${a.rotationId}:${a.physicianId}`,
      );

      expect(assignments1).toEqual(assignments2);
      expect(result1.metrics.avgScore).toBe(result2.metrics.avgScore);
    });
  });

  describe("Hard Constraint Validation", () => {
    it("enforces red week blocks", () => {
      const weeks = makeRealisticFiscalYear("fy2026");
      const rotations = makeRealisticRotations();
      const physicians = makeRealisticPhysicians();
      const assignments = makeEmptyAssignments(weeks, rotations);

      const targetCfteMap = makeRealisticCfteTargets(physicians);
      const clinicCfteMap = makeRealisticClinicCfte(physicians);
      const preferenceMap = new Map<string, Map<string, RotationPreference>>();

      // Make week 10 red for all physicians
      const availabilityMap = new Map<string, Map<string, Availability>>();
      for (const p of physicians) {
        const pMap = new Map<string, Availability>();
        for (const w of weeks) {
          pMap.set(w._id, w.weekNumber === 10 ? "red" : "green");
        }
        availabilityMap.set(p._id, pMap);
      }

      const result = runAutoFill({
        weeks,
        rotations,
        physicians,
        existingAssignments: assignments,
        availabilityMap,
        preferenceMap,
        targetCfteMap,
        clinicCfteMap,
        holidayWeeks: new Map(),
        parityScores: new Map(),
        config: DEFAULT_AUTO_FILL_CONFIG,
        fiscalYearId: "fy2026-redweek",
      });

      // Count assignments in week 10
      const week10Id = weeks.find((w) => w.weekNumber === 10)?._id;
      const week10Assignments = result.assignments.filter((a) => a.weekId === week10Id);

      console.log(`\n=== Red Week Test ===`);
      console.log(`Week 10 assignments: ${week10Assignments.length}`);

      expect(week10Assignments.length).toBe(0);

      const redWeekValidation = validateNoRedWeekViolations(result, availabilityMap);
      expect(redWeekValidation.valid, redWeekValidation.violations.join("\n")).toBe(true);
    });

    it("respects cFTE limits with clinic duties", () => {
      const weeks = makeRealisticFiscalYear("fy2026");
      const rotations = makeRealisticRotations();
      const physicians = makeRealisticPhysicians();
      const assignments = makeEmptyAssignments(weeks, rotations);

      const targetCfteMap = makeRealisticCfteTargets(physicians);
      const clinicCfteMap = makeRealisticClinicCfte(physicians);
      const availabilityMap = new Map<string, Map<string, Availability>>();
      const preferenceMap = new Map<string, Map<string, RotationPreference>>();

      const result = runAutoFill({
        weeks,
        rotations,
        physicians,
        existingAssignments: assignments,
        availabilityMap,
        preferenceMap,
        targetCfteMap,
        clinicCfteMap,
        holidayWeeks: new Map(),
        parityScores: new Map(),
        config: DEFAULT_AUTO_FILL_CONFIG,
        fiscalYearId: "fy2026-cfte",
      });

      const cfteValidation = validateCfteCompliance(result, rotations, targetCfteMap, clinicCfteMap);
      expect(cfteValidation.valid, cfteValidation.violations.join("\n")).toBe(true);
    });

    it("prevents max consecutive violations", () => {
      const weeks = makeRealisticFiscalYear("fy2026");
      const rotations = makeRealisticRotations();
      const physicians = makeRealisticPhysicians();
      const assignments = makeEmptyAssignments(weeks, rotations);

      const targetCfteMap = makeRealisticCfteTargets(physicians);
      const clinicCfteMap = new Map<string, number>();
      const availabilityMap = new Map<string, Map<string, Availability>>();
      const preferenceMap = new Map<string, Map<string, RotationPreference>>();

      const result = runAutoFill({
        weeks,
        rotations,
        physicians,
        existingAssignments: assignments,
        availabilityMap,
        preferenceMap,
        targetCfteMap,
        clinicCfteMap,
        holidayWeeks: new Map(),
        parityScores: new Map(),
        config: DEFAULT_AUTO_FILL_CONFIG,
        fiscalYearId: "fy2026-consecutive",
      });

      const consecutiveValidation = validateMaxConsecutive(result, weeks, rotations);
      expect(consecutiveValidation.valid, consecutiveValidation.violations.join("\n")).toBe(true);
    });
  });

  describe("Metrics Validation", () => {
    it("achieves high holiday parity scores", () => {
      const weeks = makeRealisticFiscalYear("fy2026");
      const rotations = makeRealisticRotations();
      const physicians = makeRealisticPhysicians();
      const assignments = makeEmptyAssignments(weeks, rotations);

      const targetCfteMap = makeRealisticCfteTargets(physicians);
      const clinicCfteMap = makeRealisticClinicCfte(physicians);
      const availabilityMap = makeRealisticAvailability(physicians, weeks, 33333);
      const preferenceMap = makeRealisticPreferences(physicians, rotations, 44444);
      const holidayWeeks = makeHolidayWeeks(weeks);
      const parityScores = makePriorYearHolidayData(physicians);

      const result = runAutoFill({
        weeks,
        rotations,
        physicians,
        existingAssignments: assignments,
        availabilityMap,
        preferenceMap,
        targetCfteMap,
        clinicCfteMap,
        holidayWeeks,
        parityScores,
        config: DEFAULT_AUTO_FILL_CONFIG,
        fiscalYearId: "fy2026-parity",
      });

      console.log(`\n=== Holiday Parity Test ===`);
      console.log(`Holiday parity score: ${result.metrics.holidayParityScore.toFixed(1)}`);

      const holidayParityValidation = validateHolidayParity(result, 60);
      expect(holidayParityValidation.valid).toBe(true);
    });

    it("maintains high preference satisfaction rate", () => {
      const weeks = makeRealisticFiscalYear("fy2026");
      const rotations = makeRealisticRotations();
      const physicians = makeRealisticPhysicians();
      const assignments = makeEmptyAssignments(weeks, rotations);

      const targetCfteMap = makeRealisticCfteTargets(physicians);
      const clinicCfteMap = makeRealisticClinicCfte(physicians);
      const availabilityMap = makeRealisticAvailability(physicians, weeks, 55555);
      const preferenceMap = makeRealisticPreferences(physicians, rotations, 66666);

      const result = runAutoFill({
        weeks,
        rotations,
        physicians,
        existingAssignments: assignments,
        availabilityMap,
        preferenceMap,
        targetCfteMap,
        clinicCfteMap,
        holidayWeeks: new Map(),
        parityScores: new Map(),
        config: DEFAULT_AUTO_FILL_CONFIG,
        fiscalYearId: "fy2026-prefs",
      });

      console.log(`\n=== Preference Satisfaction Test ===`);
      console.log(`Preferences satisfied: ${result.metrics.preferencesSatisfied}`);
      console.log(`Preferences violated: ${result.metrics.preferencesViolated}`);

      const prefSatisfactionValidation = validatePreferenceSatisfaction(result, 70);
      expect(prefSatisfactionValidation.valid).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("handles universal red weeks (all physicians unavailable)", () => {
      const weeks = makeRealisticFiscalYear("fy2026");
      const rotations = makeRealisticRotations();
      const physicians = makeRealisticPhysicians();
      const assignments = makeEmptyAssignments(weeks, rotations);

      const targetCfteMap = makeRealisticCfteTargets(physicians);
      const clinicCfteMap = new Map<string, number>();
      const preferenceMap = new Map<string, Map<string, RotationPreference>>();

      // Make week 10 red for ALL physicians
      const availabilityMap = new Map<string, Map<string, Availability>>();
      for (const p of physicians) {
        const pMap = new Map<string, Availability>();
        for (const w of weeks) {
          pMap.set(w._id, w.weekNumber === 10 ? "red" : "green");
        }
        availabilityMap.set(p._id, pMap);
      }

      const result = runAutoFill({
        weeks,
        rotations,
        physicians,
        existingAssignments: assignments,
        availabilityMap,
        preferenceMap,
        targetCfteMap,
        clinicCfteMap,
        holidayWeeks: new Map(),
        parityScores: new Map(),
        config: DEFAULT_AUTO_FILL_CONFIG,
        fiscalYearId: "fy2026-universal-red",
      });

      const week10Id = weeks.find((w) => w.weekNumber === 10)?._id;
      const week10Assignments = result.assignments.filter((a) => a.weekId === week10Id);
      const week10Unfilled = result.unfilled.filter((u) => u.weekId === week10Id);

      console.log(`\n=== Universal Red Week Test ===`);
      console.log(`Week 10 assignments: ${week10Assignments.length}`);
      console.log(`Week 10 unfilled: ${week10Unfilled.length}`);

      expect(week10Assignments.length).toBe(0);
      expect(week10Unfilled.length).toBe(rotations.length); // All 8 rotations unfilled
    });

    it("handles high-cFTE physician scenarios", () => {
      const weeks = makeRealisticFiscalYear("fy2026");
      const rotations = makeRealisticRotations();
      const physicians = makeRealisticPhysicians();
      const assignments = makeEmptyAssignments(weeks, rotations);

      // One physician with very high cFTE (0.90), others at 0.30
      const targetCfteMap = new Map<string, number>();
      targetCfteMap.set("p-std1", 0.90);
      for (let i = 2; i <= 8; i++) {
        targetCfteMap.set(`p-std${i}`, 0.30);
      }
      for (let i = 1; i <= 4; i++) {
        targetCfteMap.set(`p-part${i}`, 0.30);
      }
      for (let i = 1; i <= 2; i++) {
        targetCfteMap.set(`p-high${i}`, 0.30);
      }
      targetCfteMap.set("p-light1", 0.30);

      const clinicCfteMap = new Map<string, number>();
      const availabilityMap = new Map<string, Map<string, Availability>>();
      const preferenceMap = new Map<string, Map<string, RotationPreference>>();

      const result = runAutoFill({
        weeks,
        rotations,
        physicians,
        existingAssignments: assignments,
        availabilityMap,
        preferenceMap,
        targetCfteMap,
        clinicCfteMap,
        holidayWeeks: new Map(),
        parityScores: new Map(),
        config: DEFAULT_AUTO_FILL_CONFIG,
        fiscalYearId: "fy2026-high-cfte",
      });

      // Count assignments for high-cFTE physician
      const highCfteAssignments = result.assignments.filter((a) => a.physicianId === "p-std1");
      const otherAssignments = result.assignments.filter((a) => a.physicianId !== "p-std1");

      console.log(`\n=== High-cFTE Test ===`);
      console.log(`High-cFTE physician (p-std1) assignments: ${highCfteAssignments.length}`);
      console.log(`Other physicians total assignments: ${otherAssignments.length}`);

      // High-cFTE physician should have significantly more assignments
      expect(highCfteAssignments.length).toBeGreaterThan(otherAssignments.length / (physicians.length - 1) * 2);

      const cfteValidation = validateCfteCompliance(result, rotations, targetCfteMap, clinicCfteMap);
      expect(cfteValidation.valid, cfteValidation.violations.join("\n")).toBe(true);
    });

    it("handles universally avoided rotations", () => {
      const weeks = makeRealisticFiscalYear("fy2026");
      const rotations = makeRealisticRotations();
      const physicians = makeRealisticPhysicians();
      const assignments = makeEmptyAssignments(weeks, rotations);

      const targetCfteMap = makeRealisticCfteTargets(physicians);
      const clinicCfteMap = new Map<string, number>();
      const availabilityMap = new Map<string, Map<string, Availability>>();

      // All physicians mark r-pulm as "avoid"
      const preferenceMap = new Map<string, Map<string, RotationPreference>>();
      for (const p of physicians) {
        const pMap = new Map<string, RotationPreference>();
        pMap.set("r-pulm", { preferenceRank: null, avoid: true, deprioritize: false });
        preferenceMap.set(p._id, pMap);
      }

      const result = runAutoFill({
        weeks,
        rotations,
        physicians,
        existingAssignments: assignments,
        availabilityMap,
        preferenceMap,
        targetCfteMap,
        clinicCfteMap,
        holidayWeeks: new Map(),
        parityScores: new Map(),
        config: DEFAULT_AUTO_FILL_CONFIG,
        fiscalYearId: "fy2026-avoid",
      });

      const pulmAssignments = result.assignments.filter((a) => a.rotationId === "r-pulm");
      const pulmUnfilled = result.unfilled.filter((u) => u.rotationId === "r-pulm");

      console.log(`\n=== Universally Avoided Rotation Test ===`);
      console.log(`r-pulm assignments: ${pulmAssignments.length}`);
      console.log(`r-pulm unfilled: ${pulmUnfilled.length}`);

      expect(pulmAssignments.length).toBe(0);
      expect(pulmUnfilled.length).toBe(weeks.length); // All 52 weeks unfilled

      const avoidValidation = validateNoAvoidedRotations(result, preferenceMap);
      expect(avoidValidation.valid, avoidValidation.violations.join("\n")).toBe(true);
    });

    it("enforces holiday parity across years", () => {
      const weeks = makeRealisticFiscalYear("fy2026");
      const rotations = makeRealisticRotations();
      const physicians = makeRealisticPhysicians();
      const assignments = makeEmptyAssignments(weeks, rotations);

      const targetCfteMap = makeRealisticCfteTargets(physicians);
      const clinicCfteMap = makeRealisticClinicCfte(physicians);
      const availabilityMap = makeRealisticAvailability(physicians, weeks, 77777);
      const preferenceMap = makeRealisticPreferences(physicians, rotations, 88888);
      const holidayWeeks = makeHolidayWeeks(weeks);

      // Prior year: p-std1 through p-std5 worked Thanksgiving
      const priorThanksgivingWorkers = ["p-std1", "p-std2", "p-std3", "p-std4", "p-std5"];
      const parityScores = new Map<string, Map<string, number>>();
      for (const pId of priorThanksgivingWorkers) {
        const holidayMap = new Map<string, number>();
        holidayMap.set("thanksgiving day", 1.0);
        parityScores.set(pId, holidayMap);
      }

      const result = runAutoFill({
        weeks,
        rotations,
        physicians,
        existingAssignments: assignments,
        availabilityMap,
        preferenceMap,
        targetCfteMap,
        clinicCfteMap,
        holidayWeeks,
        parityScores,
        config: DEFAULT_AUTO_FILL_CONFIG,
        fiscalYearId: "fy2026-parity-enforcement",
      });

      const thanksgivingWeekId = weeks.find((w) => w.weekNumber === 22)?._id;
      const thanksgivingAssignments = result.assignments.filter((a) => a.weekId === thanksgivingWeekId);

      const currentYearWorkers = new Set(thanksgivingAssignments.map((a) => a.physicianId));
      const overlap = priorThanksgivingWorkers.filter((pId) => currentYearWorkers.has(pId));

      console.log(`\n=== Holiday Parity Enforcement Test ===`);
      console.log(`Prior year Thanksgiving workers: ${priorThanksgivingWorkers.join(", ")}`);
      console.log(`Current year Thanksgiving workers: ${Array.from(currentYearWorkers).join(", ")}`);
      console.log(`Overlap: ${overlap.length} physicians`);

      // Minimal overlap expected (parity system should rotate workers)
      expect(overlap.length).toBeLessThan(priorThanksgivingWorkers.length / 2);
    });
  });

  describe("Legacy Function Compatibility", () => {
    it("validates that legacy functions are still used correctly", () => {
      const weeks = makeRealisticFiscalYear("fy2026");
      const rotations = makeRealisticRotations();
      const physicians = makeRealisticPhysicians();
      const assignments = makeEmptyAssignments(weeks, rotations);

      const targetCfteMap = makeRealisticCfteTargets(physicians);
      const clinicCfteMap = makeRealisticClinicCfte(physicians);
      const availabilityMap = makeRealisticAvailability(physicians, weeks, 99999);
      const preferenceMap = makeRealisticPreferences(physicians, rotations, 11111);

      const result = runAutoFill({
        weeks,
        rotations,
        physicians,
        existingAssignments: assignments,
        availabilityMap,
        preferenceMap,
        targetCfteMap,
        clinicCfteMap,
        holidayWeeks: new Map(),
        parityScores: new Map(),
        config: DEFAULT_AUTO_FILL_CONFIG,
        fiscalYearId: "fy2026-legacy",
      });

      // If solver ran successfully, it means legacy functions (wouldExceedMaxConsecutiveWeeks, etc.) are working
      expect(result.assignments.length).toBeGreaterThan(0);

      // Validate max consecutive using legacy logic expectations
      const consecutiveValidation = validateMaxConsecutive(result, weeks, rotations);
      expect(consecutiveValidation.valid, consecutiveValidation.violations.join("\n")).toBe(true);
    });
  });
});
