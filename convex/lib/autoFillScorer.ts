import type { Availability } from "./masterCalendarAssignments";
import type { AutoFillConfig, ScoreBreakdown, ScoredCandidate } from "./autoFill";

// ========================================
// Multi-dimensional candidate scoring engine
// ========================================

export interface ScoreCandidateParams {
  physician: {
    physicianId: string;
    availability: Availability;
    headroom: number;
  };
  rotation: {
    rotationId: string;
    cftePerWeek: number;
  };
  week: {
    weekNumber: number;
    holidayNames: string[];
  };
  preferences: {
    preferenceRank: number | null;
    deprioritize: boolean;
  };
  context: {
    config: AutoFillConfig;
    parityScores: Map<string, Map<string, number>>;
    weekCountByPhysician: Map<string, number>;
    rotationCountByPhysician: Map<string, Map<string, number>>;
    lastRotationWeekByPhysician: Map<string, Map<string, number>>;
    totalPhysicians: number;
    totalWeeksToFill: number;
    targetCfteMap: Map<string, number>;
    avgTargetCfte: number;
  };
}

/**
 * Score a single candidate for a specific rotation-week cell.
 * Returns a ScoredCandidate with breakdown of all scoring dimensions.
 *
 * Each dimension produces a raw score in [0, 100].
 * The final totalScore is a weighted sum normalized to [0, 100].
 */
export function scoreCandidate(params: ScoreCandidateParams): ScoredCandidate {
  const { physician, rotation, week, preferences, context } = params;
  const { config } = context;

  const preference = scorePreference(physician.availability, preferences.preferenceRank);
  const holidayParity = scoreHolidayParity(physician.physicianId, week.holidayNames, context.parityScores);
  const workloadSpread = scoreWorkloadSpread(
    physician.physicianId,
    context.weekCountByPhysician,
    context.totalWeeksToFill,
    context.totalPhysicians,
    context.targetCfteMap,
    context.avgTargetCfte,
  );
  const rotationVariety = scoreRotationVariety(
    physician.physicianId,
    rotation.rotationId,
    context.rotationCountByPhysician,
    context.weekCountByPhysician,
  );
  const gapEnforcement = scoreGapEnforcement(
    physician.physicianId,
    rotation.rotationId,
    week.weekNumber,
    context.lastRotationWeekByPhysician,
    config.minGapWeeksBetweenStints,
  );
  const deprioritize = preferences.deprioritize ? 0 : 100;

  const breakdown: ScoreBreakdown = {
    preference,
    holidayParity,
    workloadSpread,
    rotationVariety,
    gapEnforcement,
    deprioritize,
  };

  const totalWeight =
    config.weightPreference +
    config.weightHolidayParity +
    config.weightWorkloadSpread +
    config.weightRotationVariety +
    config.weightGapEnforcement;

  // Deprioritize penalty is applied as a fixed deduction, not weighted
  const DEPRIORITIZE_PENALTY = 30;

  const weightedSum =
    config.weightPreference * preference +
    config.weightHolidayParity * holidayParity +
    config.weightWorkloadSpread * workloadSpread +
    config.weightRotationVariety * rotationVariety +
    config.weightGapEnforcement * gapEnforcement;

  let totalScore = totalWeight > 0 ? weightedSum / totalWeight : 50;

  if (preferences.deprioritize) {
    totalScore = Math.max(0, totalScore - DEPRIORITIZE_PENALTY);
  }

  return {
    physicianId: physician.physicianId,
    totalScore,
    breakdown,
    availability: physician.availability,
    headroom: physician.headroom,
  };
}

// ========================================
// Individual scoring dimensions
// ========================================

/**
 * Preference score: based on week availability and rotation rank.
 * green=100, yellow=40. Scaled by preference rank (rank 1=100%, rank 8=25%).
 */
function scorePreference(
  availability: Availability,
  preferenceRank: number | null,
): number {
  const baseScore = availability === "green" ? 100 : 40;

  if (preferenceRank === null || preferenceRank === undefined) {
    return baseScore;
  }

  // Rank 1 = 100%, rank 2 = 89%, ..., rank 8 = 25%
  const rankMultiplier = Math.max(0.25, 1 - (preferenceRank - 1) * 0.107);
  return baseScore * rankMultiplier;
}

/**
 * Holiday parity: score based on prior-year holiday assignments.
 * Uses pre-computed parity scores from autoFillHolidays.
 * If not a holiday week, returns neutral (50).
 */
function scoreHolidayParity(
  physicianId: string,
  holidayNames: string[],
  parityScores: Map<string, Map<string, number>>,
): number {
  if (holidayNames.length === 0) return 50; // Not a holiday week, neutral

  const physicianScores = parityScores.get(physicianId);
  if (!physicianScores) return 50;

  // Average parity score across all holidays in this week
  let totalParity = 0;
  let count = 0;
  for (const name of holidayNames) {
    const score = physicianScores.get(name.toLowerCase());
    if (score !== undefined) {
      totalParity += score;
      count++;
    }
  }

  if (count === 0) return 50;

  // Parity scores range from -50 to +30; normalize to 0-100
  // -50 -> 0, 0 -> 62.5, +30 -> 100
  const avgParity = totalParity / count;
  return Math.max(0, Math.min(100, (avgParity + 50) * (100 / 80)));
}

/**
 * Workload spread: bonus for physicians with fewer total assigned weeks.
 * Physicians below their ideal workload get higher scores.
 *
 * Ideal weeks are proportional to their cFTE target relative to average.
 */
function scoreWorkloadSpread(
  physicianId: string,
  weekCountByPhysician: Map<string, number>,
  totalWeeksToFill: number,
  totalPhysicians: number,
  targetCfteMap: Map<string, number>,
  avgTargetCfte: number,
): number {
  if (totalPhysicians === 0) return 50;

  const currentWeeks = weekCountByPhysician.get(physicianId) ?? 0;
  const avgWeeksPerPhysician = totalWeeksToFill / totalPhysicians;

  // Calculate weighted ideal based on cFTE target
  const physicianTarget = targetCfteMap.get(physicianId) ?? avgTargetCfte;
  const idealWeeks = avgTargetCfte > 0
    ? (physicianTarget / avgTargetCfte) * avgWeeksPerPhysician
    : avgWeeksPerPhysician;

  if (idealWeeks === 0) return 50;

  // Ratio of current to ideal: 0 means no weeks assigned, 1 means at ideal
  const ratio = currentWeeks / idealWeeks;

  // Score: below ideal (ratio < 1) = high score, above ideal (ratio > 1) = low score
  // ratio 0 -> 100, ratio 0.5 -> 75, ratio 1.0 -> 50, ratio 1.5 -> 25, ratio 2.0 -> 0
  return Math.max(0, Math.min(100, 100 - ratio * 50));
}

/**
 * Rotation variety: bonus if physician hasn't done this rotation much.
 * Penalizes over-concentration on a single rotation.
 */
function scoreRotationVariety(
  physicianId: string,
  rotationId: string,
  rotationCountByPhysician: Map<string, Map<string, number>>,
  weekCountByPhysician: Map<string, number>,
): number {
  const rotationCounts = rotationCountByPhysician.get(physicianId);
  if (!rotationCounts) return 100; // Never assigned anything = maximum variety bonus

  const thisRotationCount = rotationCounts.get(rotationId) ?? 0;
  const totalAssigned = weekCountByPhysician.get(physicianId) ?? 0;

  if (totalAssigned === 0) return 100;

  // Concentration: what % of this physician's weeks are on this rotation?
  const concentration = thisRotationCount / totalAssigned;

  // 0% concentration = 100, 40% = 60, 100% = 0
  return Math.max(0, Math.min(100, 100 - concentration * 100));
}

/**
 * Gap enforcement: bonus for larger gaps since last stint on this rotation.
 * Penalty for gaps below minGapWeeksBetweenStints.
 */
function scoreGapEnforcement(
  physicianId: string,
  rotationId: string,
  currentWeekNumber: number,
  lastRotationWeekByPhysician: Map<string, Map<string, number>>,
  minGapWeeks: number,
): number {
  const lastWeeks = lastRotationWeekByPhysician.get(physicianId);
  if (!lastWeeks) return 100; // Never been on this rotation = max gap

  const lastWeekNumber = lastWeeks.get(rotationId);
  if (lastWeekNumber === undefined) return 100;

  const gap = currentWeekNumber - lastWeekNumber;

  if (gap <= 0) return 50; // Same week or earlier (shouldn't happen, neutral)

  if (gap < minGapWeeks) {
    // Below minimum gap -> penalty
    // gap 1 with minGap 2 -> score ~25
    return Math.max(0, (gap / minGapWeeks) * 50);
  }

  // Above minimum: larger gaps get higher scores, capped at 100
  // minGap -> 50, 2*minGap -> 75, 4*minGap+ -> 100
  const bonusGap = gap - minGapWeeks;
  const maxBonusGap = minGapWeeks * 3; // Beyond this, no additional bonus
  const bonus = maxBonusGap > 0
    ? Math.min(50, (bonusGap / maxBonusGap) * 50)
    : 50;
  return 50 + bonus;
}
