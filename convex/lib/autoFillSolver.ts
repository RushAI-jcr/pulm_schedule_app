import type { Availability } from "./masterCalendarAssignments";
import { wouldExceedMaxConsecutiveWeeks } from "./masterCalendarAssignments";
import type { AutoFillConfig, RotationPreference, ScoredCandidate, ScoreBreakdown } from "./autoFill";
import { buildWeekToPhysicianMap, hasWeekConflict, seededShuffle, createSeededRng, hashStringToSeed } from "./autoFill";
import { scoreCandidate } from "./autoFillScorer";
import { getPhysicianMaxConsecutiveWeeks } from "./physicianConsecutiveWeekRules";

// ========================================
// Multi-pass auto-fill constraint solver
// ========================================

const CFTE_EPSILON = 0.000001;
const MAX_SWAP_ITERATIONS = 500;

export interface AutoFillAssignment {
  weekId: string;
  rotationId: string;
  physicianId: string;
  score: number;
  breakdown: ScoreBreakdown;
  passNumber: number;
}

export interface AutoFillMetrics {
  totalCells: number;
  filledCells: number;
  unfilledCells: number;
  avgScore: number;
  holidayParityScore: number;
  cfteVariance: number;
  preferencesSatisfied: number;
  preferencesViolated: number;
  workloadStdDev: number;
}

export interface UnfilledCell {
  weekId: string;
  rotationId: string;
  reason: string;
}

export interface AutoFillResult {
  assignments: AutoFillAssignment[];
  metrics: AutoFillMetrics;
  unfilled: UnfilledCell[];
}

export interface RotationDoc {
  _id: string;
  name: string;
  abbreviation: string;
  cftePerWeek: number;
  minStaff: number;
  maxConsecutiveWeeks: number;
  sortOrder: number;
  isActive: boolean;
}

export interface WeekDoc {
  _id: string;
  weekNumber: number;
}

export interface PhysicianDoc {
  _id: string;
  initials: string;
  isActive: boolean;
  activeFromWeekId?: string;
  activeUntilWeekId?: string;
}

export interface ExistingAssignment {
  _id: string;
  weekId: string;
  rotationId: string;
  physicianId: string | null | undefined;
  assignmentSource?: string | null;
}

export interface RunAutoFillParams {
  weeks: WeekDoc[];
  rotations: RotationDoc[];
  physicians: PhysicianDoc[];
  existingAssignments: ExistingAssignment[];
  availabilityMap: Map<string, Map<string, Availability>>;
  preferenceMap: Map<string, Map<string, RotationPreference>>;
  targetCfteMap: Map<string, number>;
  clinicCfteMap: Map<string, number>;
  holidayWeeks: Map<string, string[]>;
  parityScores: Map<string, Map<string, number>>;
  config: AutoFillConfig;
  fiscalYearId: string;
}

/**
 * Run the multi-pass auto-fill algorithm.
 *
 * Pass 1: Scored fill with shuffled iteration order
 * Pass 2: Relaxed fill for remaining empty cells
 * Pass 3: Hill-climbing swap optimization
 */
export function runAutoFill(params: RunAutoFillParams): AutoFillResult {
  const {
    weeks,
    rotations,
    physicians,
    existingAssignments,
    availabilityMap,
    preferenceMap,
    targetCfteMap,
    clinicCfteMap,
    holidayWeeks,
    parityScores,
    config,
    fiscalYearId,
  } = params;

  const activePhysicians = physicians.filter((p) => p.isActive);
  const activeRotations = rotations.filter((r) => r.isActive);

  // Build initial state
  const state = buildSolverState({
    weeks,
    rotations: activeRotations,
    physicians: activePhysicians,
    existingAssignments,
    targetCfteMap,
    clinicCfteMap,
  });

  const allWeekNumbers = weeks.map((w) => w.weekNumber).sort((a, b) => a - b);
  const weekNumberById = new Map(weeks.map((w) => [w._id, w.weekNumber]));
  const rotationsById = new Map(activeRotations.map((r) => [r._id, r]));
  const physiciansById = new Map(activePhysicians.map((p) => [p._id, p]));

  // Calculate context values
  const totalPhysicians = activePhysicians.length;
  const totalWeeksToFill = state.emptyCells.length;
  const cfteValues = [...targetCfteMap.values()];
  const avgTargetCfte = cfteValues.length > 0
    ? cfteValues.reduce((a, b) => a + b, 0) / cfteValues.length
    : 0;

  // Seeded RNG for deterministic results
  const seed = hashStringToSeed(fiscalYearId);
  const rng = createSeededRng(seed);

  const resultAssignments: AutoFillAssignment[] = [];
  const unfilled: UnfilledCell[] = [];

  // ========================================
  // Pass 1: Scored fill with shuffled order
  // ========================================

  const shuffledCells = seededShuffle([...state.emptyCells], rng);

  for (const cell of shuffledCells) {
    const rotation = rotationsById.get(cell.rotationId);
    if (!rotation) continue;

    const weekNumber = weekNumberById.get(cell.weekId);
    if (weekNumber === undefined) continue;

    const weekHolidays = holidayWeeks.get(cell.weekId) ?? [];

    const scored = scoreCandidatesForCell({
      cell,
      rotation,
      weekNumber,
      weekHolidays,
      activePhysicians,
      availabilityMap,
      preferenceMap,
      targetCfteMap,
      clinicCfteMap,
      state,
      allWeekNumbers,
      weeks,
      config,
      parityScores,
      totalPhysicians,
      totalWeeksToFill,
      avgTargetCfte,
    });

    if (scored.length === 0) continue;

    // Select highest scoring candidate
    const best = scored[0];
    applyAssignment(state, cell, best, rotation, weekNumber);
    resultAssignments.push({
      weekId: cell.weekId,
      rotationId: cell.rotationId,
      physicianId: best.physicianId,
      score: best.totalScore,
      breakdown: best.breakdown,
      passNumber: 1,
    });
  }

  // ========================================
  // Pass 2: Relaxed fill for remaining cells
  // ========================================

  const remainingCells = state.emptyCells.filter(
    (c) => !resultAssignments.some((a) => a.weekId === c.weekId && a.rotationId === c.rotationId),
  );

  for (const cell of remainingCells) {
    const rotation = rotationsById.get(cell.rotationId);
    if (!rotation) continue;

    const weekNumber = weekNumberById.get(cell.weekId);
    if (weekNumber === undefined) continue;

    const weekHolidays = holidayWeeks.get(cell.weekId) ?? [];

    // Relaxed: only enforce hard constraints, accept any score
    const candidates = getHardConstraintCandidates({
      cell,
      rotation,
      weekNumber,
      activePhysicians,
      availabilityMap,
      preferenceMap,
      targetCfteMap,
      clinicCfteMap,
      state,
      allWeekNumbers,
      weeks,
    });

    if (candidates.length === 0) {
      unfilled.push({
        weekId: cell.weekId,
        rotationId: cell.rotationId,
        reason: "No eligible physicians after hard constraint filtering",
      });
      continue;
    }

    // Score candidates with relaxed weights (but still use scoring for ordering)
    const scored: ScoredCandidate[] = candidates.map((c) =>
      scoreCandidate({
        physician: c,
        rotation: { rotationId: cell.rotationId, cftePerWeek: rotation.cftePerWeek },
        week: { weekNumber, holidayNames: weekHolidays },
        preferences: {
          preferenceRank: getPreferenceRank(preferenceMap, c.physicianId, cell.rotationId),
          deprioritize: getDeprioritize(preferenceMap, c.physicianId, cell.rotationId),
        },
        context: {
          config,
          parityScores,
          weekCountByPhysician: state.weekCountByPhysician,
          rotationCountByPhysician: state.rotationCountByPhysician,
          lastRotationWeekByPhysician: state.lastRotationWeekByPhysician,
          totalPhysicians,
          totalWeeksToFill,
          targetCfteMap,
          avgTargetCfte,
        },
      }),
    );

    scored.sort((a, b) => b.totalScore - a.totalScore);
    const best = scored[0];

    applyAssignment(state, cell, best, rotation, weekNumber);
    resultAssignments.push({
      weekId: cell.weekId,
      rotationId: cell.rotationId,
      physicianId: best.physicianId,
      score: best.totalScore,
      breakdown: best.breakdown,
      passNumber: 2,
    });
  }

  // ========================================
  // Pass 3: Hill-climbing swap optimization
  // ========================================

  let improved = true;
  let iterations = 0;

  while (improved && iterations < MAX_SWAP_ITERATIONS) {
    improved = false;
    iterations++;

    for (let i = 0; i < resultAssignments.length; i++) {
      const a1 = resultAssignments[i];

      // Don't swap anchored (manually-placed) assignments
      const existingA1 = existingAssignments.find(
        (e) => e.weekId === a1.weekId && e.rotationId === a1.rotationId,
      );
      if (existingA1?.physicianId && existingA1.assignmentSource !== "auto") continue;

      for (let j = i + 1; j < resultAssignments.length; j++) {
        const a2 = resultAssignments[j];

        // Don't swap anchored assignments
        const existingA2 = existingAssignments.find(
          (e) => e.weekId === a2.weekId && e.rotationId === a2.rotationId,
        );
        if (existingA2?.physicianId && existingA2.assignmentSource !== "auto") continue;

        // Skip if same physician (no point swapping)
        if (a1.physicianId === a2.physicianId) continue;

        // Check if swap is feasible (hard constraints satisfied for both)
        const r1 = rotationsById.get(a1.rotationId);
        const r2 = rotationsById.get(a2.rotationId);
        if (!r1 || !r2) continue;

        const wn1 = weekNumberById.get(a1.weekId);
        const wn2 = weekNumberById.get(a2.weekId);
        if (wn1 === undefined || wn2 === undefined) continue;

        if (!canSwap(state, a1, a2, r1, r2, wn1, wn2, availabilityMap, preferenceMap, targetCfteMap, clinicCfteMap, allWeekNumbers)) {
          continue;
        }

        // Calculate scores after swap
        const currentTotal = a1.score + a2.score;

        const weekHolidays1 = holidayWeeks.get(a1.weekId) ?? [];
        const weekHolidays2 = holidayWeeks.get(a2.weekId) ?? [];

        const newScore1 = scoreCandidate({
          physician: { physicianId: a2.physicianId, availability: getAvailability(availabilityMap, a2.physicianId, a1.weekId), headroom: getHeadroom(state, a2.physicianId, targetCfteMap, clinicCfteMap) },
          rotation: { rotationId: a1.rotationId, cftePerWeek: r1.cftePerWeek },
          week: { weekNumber: wn1, holidayNames: weekHolidays1 },
          preferences: { preferenceRank: getPreferenceRank(preferenceMap, a2.physicianId, a1.rotationId), deprioritize: getDeprioritize(preferenceMap, a2.physicianId, a1.rotationId) },
          context: { config, parityScores, weekCountByPhysician: state.weekCountByPhysician, rotationCountByPhysician: state.rotationCountByPhysician, lastRotationWeekByPhysician: state.lastRotationWeekByPhysician, totalPhysicians, totalWeeksToFill, targetCfteMap, avgTargetCfte },
        });

        const newScore2 = scoreCandidate({
          physician: { physicianId: a1.physicianId, availability: getAvailability(availabilityMap, a1.physicianId, a2.weekId), headroom: getHeadroom(state, a1.physicianId, targetCfteMap, clinicCfteMap) },
          rotation: { rotationId: a2.rotationId, cftePerWeek: r2.cftePerWeek },
          week: { weekNumber: wn2, holidayNames: weekHolidays2 },
          preferences: { preferenceRank: getPreferenceRank(preferenceMap, a1.physicianId, a2.rotationId), deprioritize: getDeprioritize(preferenceMap, a1.physicianId, a2.rotationId) },
          context: { config, parityScores, weekCountByPhysician: state.weekCountByPhysician, rotationCountByPhysician: state.rotationCountByPhysician, lastRotationWeekByPhysician: state.lastRotationWeekByPhysician, totalPhysicians, totalWeeksToFill, targetCfteMap, avgTargetCfte },
        });

        const newTotal = newScore1.totalScore + newScore2.totalScore;

        if (newTotal > currentTotal + 1) {
          // Accept swap
          executeSwap(state, resultAssignments, i, j, a1, a2, newScore1, newScore2, wn1, wn2, r1, r2);
          improved = true;
          break; // Restart inner loop after swap
        }
      }

      if (improved) break; // Restart outer loop
    }
  }

  // ========================================
  // Compute final metrics
  // ========================================

  const metrics = computeMetrics(
    resultAssignments,
    state,
    targetCfteMap,
    clinicCfteMap,
    existingAssignments,
    unfilled,
    availabilityMap,
  );

  return { assignments: resultAssignments, metrics, unfilled };
}

// ========================================
// Internal solver state
// ========================================

interface CellRef {
  weekId: string;
  rotationId: string;
}

interface SolverState {
  emptyCells: CellRef[];
  weekToPhysicianMap: Map<string, Set<string>>;
  weekCountByPhysician: Map<string, number>;
  rotationCountByPhysician: Map<string, Map<string, number>>;
  lastRotationWeekByPhysician: Map<string, Map<string, number>>;
  assignedWeeksByPhysicianRotation: Map<string, Map<string, Set<number>>>; // NEW: actual week numbers
  runningRotationCfte: Map<string, number>;
}

function buildSolverState(params: {
  weeks: WeekDoc[];
  rotations: RotationDoc[];
  physicians: PhysicianDoc[];
  existingAssignments: ExistingAssignment[];
  targetCfteMap: Map<string, number>;
  clinicCfteMap: Map<string, number>;
}): SolverState {
  const { existingAssignments } = params;

  // Identify empty cells (unassigned or assigned by auto-fill)
  const emptyCells: CellRef[] = [];
  for (const a of existingAssignments) {
    if (!a.physicianId) {
      emptyCells.push({ weekId: a.weekId, rotationId: a.rotationId });
    }
  }

  // Build week-to-physician map from anchored assignments
  const anchoredAssignments = existingAssignments.filter(
    (a) => a.physicianId && a.assignmentSource !== "auto",
  );
  const weekToPhysicianMap = buildWeekToPhysicianMap(
    anchoredAssignments.map((a) => ({ weekId: a.weekId, physicianId: a.physicianId })),
  );

  // Build running counts from anchored assignments
  const weekCountByPhysician = new Map<string, number>();
  const rotationCountByPhysician = new Map<string, Map<string, number>>();
  const lastRotationWeekByPhysician = new Map<string, Map<string, number>>();
  const assignedWeeksByPhysicianRotation = new Map<string, Map<string, Set<number>>>();
  const runningRotationCfte = new Map<string, number>();

  // We need week numbers for tracking - store a temp lookup
  const weekNumberLookup = new Map<string, number>();
  for (const w of params.weeks) {
    weekNumberLookup.set(w._id, w.weekNumber);
  }

  const rotationCfteLookup = new Map<string, number>();
  for (const r of params.rotations) {
    rotationCfteLookup.set(r._id, r.cftePerWeek);
  }

  for (const a of anchoredAssignments) {
    if (!a.physicianId) continue;
    const pid = a.physicianId;
    const weekNumber = weekNumberLookup.get(a.weekId);

    weekCountByPhysician.set(pid, (weekCountByPhysician.get(pid) ?? 0) + 1);

    let rotCounts = rotationCountByPhysician.get(pid);
    if (!rotCounts) {
      rotCounts = new Map<string, number>();
      rotationCountByPhysician.set(pid, rotCounts);
    }
    rotCounts.set(a.rotationId, (rotCounts.get(a.rotationId) ?? 0) + 1);

    if (weekNumber !== undefined) {
      let lastWeeks = lastRotationWeekByPhysician.get(pid);
      if (!lastWeeks) {
        lastWeeks = new Map<string, number>();
        lastRotationWeekByPhysician.set(pid, lastWeeks);
      }
      const currentLast = lastWeeks.get(a.rotationId) ?? 0;
      if (weekNumber > currentLast) {
        lastWeeks.set(a.rotationId, weekNumber);
      }

      // Track actual assigned week numbers
      let physicianWeeks = assignedWeeksByPhysicianRotation.get(pid);
      if (!physicianWeeks) {
        physicianWeeks = new Map<string, Set<number>>();
        assignedWeeksByPhysicianRotation.set(pid, physicianWeeks);
      }
      let rotationWeeks = physicianWeeks.get(a.rotationId);
      if (!rotationWeeks) {
        rotationWeeks = new Set<number>();
        physicianWeeks.set(a.rotationId, rotationWeeks);
      }
      rotationWeeks.add(weekNumber);
    }

    const cftePerWeek = rotationCfteLookup.get(a.rotationId) ?? 0;
    runningRotationCfte.set(pid, (runningRotationCfte.get(pid) ?? 0) + cftePerWeek);
  }

  return {
    emptyCells,
    weekToPhysicianMap,
    weekCountByPhysician,
    rotationCountByPhysician,
    lastRotationWeekByPhysician,
    assignedWeeksByPhysicianRotation,
    runningRotationCfte,
  };
}

// ========================================
// Hard constraint filtering
// ========================================

interface HardConstraintCandidate {
  physicianId: string;
  availability: Availability;
  headroom: number;
}

function getHardConstraintCandidates(params: {
  cell: CellRef;
  rotation: RotationDoc;
  weekNumber: number;
  activePhysicians: PhysicianDoc[];
  availabilityMap: Map<string, Map<string, Availability>>;
  preferenceMap: Map<string, Map<string, RotationPreference>>;
  targetCfteMap: Map<string, number>;
  clinicCfteMap: Map<string, number>;
  state: SolverState;
  allWeekNumbers: number[];
  weeks: WeekDoc[];
}): HardConstraintCandidate[] {
  const {
    cell, rotation, weekNumber, activePhysicians,
    availabilityMap, preferenceMap, targetCfteMap, clinicCfteMap,
    state, allWeekNumbers, weeks,
  } = params;

  const candidates: HardConstraintCandidate[] = [];

  for (const physician of activePhysicians) {
    const pid = physician._id;

    // Hard constraint 1: Red week = blocked
    const availability = getAvailability(availabilityMap, pid, cell.weekId);
    if (availability === "red") continue;

    // Hard constraint 1.5: Physician active date range
    if (physician.activeFromWeekId) {
      const activeFromWeek = weeks.find((w) => w._id === physician.activeFromWeekId);
      if (activeFromWeek && weekNumber < activeFromWeek.weekNumber) continue;
    }
    if (physician.activeUntilWeekId) {
      const activeUntilWeek = weeks.find((w) => w._id === physician.activeUntilWeekId);
      if (activeUntilWeek && weekNumber > activeUntilWeek.weekNumber) continue;
    }

    // Hard constraint 2: Avoid rotation = blocked
    const pref = preferenceMap.get(pid)?.get(cell.rotationId);
    if (pref?.avoid) continue;

    // Hard constraint 3: cFTE headroom
    const targetCfte = targetCfteMap.get(pid);
    if (targetCfte === undefined) continue;
    const clinicCfte = clinicCfteMap.get(pid) ?? 0;
    const rotationCfte = state.runningRotationCfte.get(pid) ?? 0;
    const headroom = targetCfte - (clinicCfte + rotationCfte);
    if (headroom + CFTE_EPSILON < rotation.cftePerWeek) continue;

    // Hard constraint 4: Max consecutive weeks on this rotation
    const rotCounts = state.rotationCountByPhysician.get(pid);
    const assignedWeekNumbers = getAssignedWeekNumbersForRotation(
      state, pid, cell.rotationId,
    );
    // Get physician-specific max consecutive (e.g., JG prefers 2 weeks for MICU, WL for ROPH)
    const physicianMaxConsecutive = getPhysicianMaxConsecutiveWeeks(
      physician.initials,
      rotation.abbreviation,
      rotation.maxConsecutiveWeeks,
    );
    if (wouldExceedMaxConsecutiveWeeks({
      allWeekNumbers,
      assignedWeekNumbers,
      candidateWeekNumber: weekNumber,
      maxConsecutiveWeeks: physicianMaxConsecutive,
    })) continue;

    // Hard constraint 5: Same-week conflict (1 rotation per physician per week)
    if (hasWeekConflict(state.weekToPhysicianMap, cell.weekId, pid)) continue;

    candidates.push({ physicianId: pid, availability, headroom });
  }

  return candidates;
}

// ========================================
// Score and sort candidates for a cell
// ========================================

function scoreCandidatesForCell(params: {
  cell: CellRef;
  rotation: RotationDoc;
  weekNumber: number;
  weekHolidays: string[];
  activePhysicians: PhysicianDoc[];
  availabilityMap: Map<string, Map<string, Availability>>;
  preferenceMap: Map<string, Map<string, RotationPreference>>;
  targetCfteMap: Map<string, number>;
  clinicCfteMap: Map<string, number>;
  state: SolverState;
  allWeekNumbers: number[];
  weeks: WeekDoc[];
  config: AutoFillConfig;
  parityScores: Map<string, Map<string, number>>;
  totalPhysicians: number;
  totalWeeksToFill: number;
  avgTargetCfte: number;
}): ScoredCandidate[] {
  const {
    cell, rotation, weekNumber, weekHolidays,
    activePhysicians, availabilityMap, preferenceMap,
    targetCfteMap, clinicCfteMap, state, allWeekNumbers, weeks,
    config, parityScores, totalPhysicians, totalWeeksToFill, avgTargetCfte,
  } = params;

  const hardCandidates = getHardConstraintCandidates({
    cell, rotation, weekNumber, activePhysicians,
    availabilityMap, preferenceMap, targetCfteMap, clinicCfteMap,
    state, allWeekNumbers, weeks,
  });

  const scored: ScoredCandidate[] = hardCandidates.map((c) =>
    scoreCandidate({
      physician: c,
      rotation: { rotationId: cell.rotationId, cftePerWeek: rotation.cftePerWeek },
      week: { weekNumber, holidayNames: weekHolidays },
      preferences: {
        preferenceRank: getPreferenceRank(preferenceMap, c.physicianId, cell.rotationId),
        deprioritize: getDeprioritize(preferenceMap, c.physicianId, cell.rotationId),
      },
      context: {
        config,
        parityScores,
        weekCountByPhysician: state.weekCountByPhysician,
        rotationCountByPhysician: state.rotationCountByPhysician,
        lastRotationWeekByPhysician: state.lastRotationWeekByPhysician,
        totalPhysicians,
        totalWeeksToFill,
        targetCfteMap,
        avgTargetCfte,
      },
    }),
  );

  scored.sort((a, b) => b.totalScore - a.totalScore);
  return scored;
}

// ========================================
// State mutation helpers
// ========================================

function applyAssignment(
  state: SolverState,
  cell: CellRef,
  candidate: ScoredCandidate,
  rotation: RotationDoc,
  weekNumber: number,
): void {
  const pid = candidate.physicianId;

  // Update week-to-physician map
  let weekSet = state.weekToPhysicianMap.get(cell.weekId);
  if (!weekSet) {
    weekSet = new Set<string>();
    state.weekToPhysicianMap.set(cell.weekId, weekSet);
  }
  weekSet.add(pid);

  // Update week count
  state.weekCountByPhysician.set(pid, (state.weekCountByPhysician.get(pid) ?? 0) + 1);

  // Update rotation count
  let rotCounts = state.rotationCountByPhysician.get(pid);
  if (!rotCounts) {
    rotCounts = new Map<string, number>();
    state.rotationCountByPhysician.set(pid, rotCounts);
  }
  rotCounts.set(cell.rotationId, (rotCounts.get(cell.rotationId) ?? 0) + 1);

  // Update last rotation week
  let lastWeeks = state.lastRotationWeekByPhysician.get(pid);
  if (!lastWeeks) {
    lastWeeks = new Map<string, number>();
    state.lastRotationWeekByPhysician.set(pid, lastWeeks);
  }
  const currentLast = lastWeeks.get(cell.rotationId) ?? 0;
  if (weekNumber > currentLast) {
    lastWeeks.set(cell.rotationId, weekNumber);
  }

  // Update assigned week numbers for consecutive week tracking
  let physicianWeeks = state.assignedWeeksByPhysicianRotation.get(pid);
  if (!physicianWeeks) {
    physicianWeeks = new Map<string, Set<number>>();
    state.assignedWeeksByPhysicianRotation.set(pid, physicianWeeks);
  }
  let rotationWeeks = physicianWeeks.get(cell.rotationId);
  if (!rotationWeeks) {
    rotationWeeks = new Set<number>();
    physicianWeeks.set(cell.rotationId, rotationWeeks);
  }
  rotationWeeks.add(weekNumber);

  // Update cFTE
  state.runningRotationCfte.set(
    pid,
    (state.runningRotationCfte.get(pid) ?? 0) + rotation.cftePerWeek,
  );
}

// ========================================
// Swap helpers (Pass 3)
// ========================================

function canSwap(
  state: SolverState,
  a1: AutoFillAssignment,
  a2: AutoFillAssignment,
  r1: RotationDoc,
  r2: RotationDoc,
  wn1: number,
  wn2: number,
  availabilityMap: Map<string, Map<string, Availability>>,
  preferenceMap: Map<string, Map<string, RotationPreference>>,
  targetCfteMap: Map<string, number>,
  clinicCfteMap: Map<string, number>,
  allWeekNumbers: number[],
): boolean {
  // Check availability constraints after swap
  const avail1After = getAvailability(availabilityMap, a2.physicianId, a1.weekId);
  if (avail1After === "red") return false;

  const avail2After = getAvailability(availabilityMap, a1.physicianId, a2.weekId);
  if (avail2After === "red") return false;

  // Check avoid constraints after swap
  const pref1After = preferenceMap.get(a2.physicianId)?.get(a1.rotationId);
  if (pref1After?.avoid) return false;

  const pref2After = preferenceMap.get(a1.physicianId)?.get(a2.rotationId);
  if (pref2After?.avoid) return false;

  // Check same-week conflicts after swap (would either physician
  // already have another rotation in the swapped week?)
  // Temporarily remove current assignments from map for checking
  const week1Set = state.weekToPhysicianMap.get(a1.weekId);
  const week2Set = state.weekToPhysicianMap.get(a2.weekId);

  // a2.physicianId going to a1's week: check if they already have a different assignment there
  if (week1Set) {
    // They shouldn't conflict unless they already have ANOTHER assignment in that week
    const tempSet = new Set(week1Set);
    tempSet.delete(a1.physicianId); // remove current occupant
    if (tempSet.has(a2.physicianId)) return false;
  }
  if (week2Set) {
    const tempSet = new Set(week2Set);
    tempSet.delete(a2.physicianId);
    if (tempSet.has(a1.physicianId)) return false;
  }

  return true;
}

function executeSwap(
  state: SolverState,
  assignments: AutoFillAssignment[],
  i: number,
  j: number,
  a1: AutoFillAssignment,
  a2: AutoFillAssignment,
  newScore1: ScoredCandidate,
  newScore2: ScoredCandidate,
  wn1: number,
  wn2: number,
  r1: RotationDoc,
  r2: RotationDoc,
): void {
  // Update week-to-physician map
  const week1Set = state.weekToPhysicianMap.get(a1.weekId);
  const week2Set = state.weekToPhysicianMap.get(a2.weekId);
  if (week1Set) {
    week1Set.delete(a1.physicianId);
    week1Set.add(a2.physicianId);
  }
  if (week2Set) {
    week2Set.delete(a2.physicianId);
    week2Set.add(a1.physicianId);
  }

  // Update cFTE: remove old, add new
  const cfte1 = state.runningRotationCfte.get(a1.physicianId) ?? 0;
  const cfte2 = state.runningRotationCfte.get(a2.physicianId) ?? 0;
  state.runningRotationCfte.set(a1.physicianId, cfte1 - r1.cftePerWeek + r2.cftePerWeek);
  state.runningRotationCfte.set(a2.physicianId, cfte2 - r2.cftePerWeek + r1.cftePerWeek);

  // Update rotation counts
  const rotCounts1 = state.rotationCountByPhysician.get(a1.physicianId);
  const rotCounts2 = state.rotationCountByPhysician.get(a2.physicianId);
  if (rotCounts1) {
    rotCounts1.set(a1.rotationId, (rotCounts1.get(a1.rotationId) ?? 1) - 1);
    rotCounts1.set(a2.rotationId, (rotCounts1.get(a2.rotationId) ?? 0) + 1);
  }
  if (rotCounts2) {
    rotCounts2.set(a2.rotationId, (rotCounts2.get(a2.rotationId) ?? 1) - 1);
    rotCounts2.set(a1.rotationId, (rotCounts2.get(a1.rotationId) ?? 0) + 1);
  }

  // Update the assignment records
  assignments[i] = {
    weekId: a1.weekId,
    rotationId: a1.rotationId,
    physicianId: a2.physicianId,
    score: newScore1.totalScore,
    breakdown: newScore1.breakdown,
    passNumber: 3,
  };
  assignments[j] = {
    weekId: a2.weekId,
    rotationId: a2.rotationId,
    physicianId: a1.physicianId,
    score: newScore2.totalScore,
    breakdown: newScore2.breakdown,
    passNumber: 3,
  };
}

// ========================================
// Metrics computation
// ========================================

function computeMetrics(
  assignments: AutoFillAssignment[],
  state: SolverState,
  targetCfteMap: Map<string, number>,
  clinicCfteMap: Map<string, number>,
  existingAssignments: ExistingAssignment[],
  unfilled: UnfilledCell[],
  availabilityMap: Map<string, Map<string, Availability>>,
): AutoFillMetrics {
  const totalAnchoredFilled = existingAssignments.filter(
    (a) => a.physicianId && a.assignmentSource !== "auto",
  ).length;
  const totalCells = existingAssignments.length;
  const filledCells = totalAnchoredFilled + assignments.length;
  const unfilledCells = unfilled.length;

  // Average score
  const avgScore = assignments.length > 0
    ? assignments.reduce((sum, a) => sum + a.score, 0) / assignments.length
    : 0;

  // Holiday parity score (average of holiday week assignment scores)
  const holidayAssignments = assignments.filter((a) => a.breakdown.holidayParity !== 50);
  const holidayParityScore = holidayAssignments.length > 0
    ? holidayAssignments.reduce((sum, a) => sum + a.breakdown.holidayParity, 0) / holidayAssignments.length
    : 100;

  // cFTE variance
  const cfteUtilizations: number[] = [];
  for (const [pid, target] of targetCfteMap) {
    if (target === 0) continue;
    const rotationCfte = state.runningRotationCfte.get(pid) ?? 0;
    const clinicCfte = clinicCfteMap.get(pid) ?? 0;
    cfteUtilizations.push((rotationCfte + clinicCfte) / target);
  }
  const cfteVariance = computeStdDev(cfteUtilizations);

  // Preference satisfaction
  let greenCount = 0;
  let yellowCount = 0;
  for (const a of assignments) {
    const avail = getAvailability(availabilityMap, a.physicianId, a.weekId);
    if (avail === "green") greenCount++;
    if (avail === "yellow") yellowCount++;
  }
  const preferencesSatisfied = assignments.length > 0 ? (greenCount / assignments.length) * 100 : 100;
  const preferencesViolated = assignments.length > 0 ? (yellowCount / assignments.length) * 100 : 0;

  // Workload std dev
  const weekCounts = [...state.weekCountByPhysician.values()];
  const workloadStdDev = computeStdDev(weekCounts);

  return {
    totalCells,
    filledCells,
    unfilledCells,
    avgScore: Math.round(avgScore * 100) / 100,
    holidayParityScore: Math.round(holidayParityScore * 100) / 100,
    cfteVariance: Math.round(cfteVariance * 10000) / 10000,
    preferencesSatisfied: Math.round(preferencesSatisfied * 100) / 100,
    preferencesViolated: Math.round(preferencesViolated * 100) / 100,
    workloadStdDev: Math.round(workloadStdDev * 100) / 100,
  };
}

function computeStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ========================================
// Utility helpers
// ========================================

function getAvailability(
  map: Map<string, Map<string, Availability>>,
  physicianId: string,
  weekId: string,
): Availability {
  return map.get(physicianId)?.get(weekId) ?? "green";
}

function getPreferenceRank(
  map: Map<string, Map<string, RotationPreference>>,
  physicianId: string,
  rotationId: string,
): number | null {
  return map.get(physicianId)?.get(rotationId)?.preferenceRank ?? null;
}

function getDeprioritize(
  map: Map<string, Map<string, RotationPreference>>,
  physicianId: string,
  rotationId: string,
): boolean {
  return map.get(physicianId)?.get(rotationId)?.deprioritize ?? false;
}

function getHeadroom(
  state: SolverState,
  physicianId: string,
  targetCfteMap: Map<string, number>,
  clinicCfteMap: Map<string, number>,
): number {
  const target = targetCfteMap.get(physicianId) ?? 0;
  const clinic = clinicCfteMap.get(physicianId) ?? 0;
  const rotation = state.runningRotationCfte.get(physicianId) ?? 0;
  return target - (clinic + rotation);
}

function getAssignedWeekNumbersForRotation(
  state: SolverState,
  physicianId: string,
  rotationId: string,
): number[] {
  // Return actual assigned week numbers from state
  const physicianWeeks = state.assignedWeeksByPhysicianRotation.get(physicianId);
  if (!physicianWeeks) return [];
  const rotationWeeks = physicianWeeks.get(rotationId);
  if (!rotationWeeks) return [];
  return Array.from(rotationWeeks);
}
