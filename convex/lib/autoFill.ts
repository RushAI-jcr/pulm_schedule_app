import type { Availability } from "./masterCalendarAssignments";

// ========================================
// Core types for auto-fill constraint solver
// ========================================

export interface ScoreBreakdown {
  preference: number;
  holidayParity: number;
  workloadSpread: number;
  rotationVariety: number;
  gapEnforcement: number;
  deprioritize: number;
}

export interface ScoredCandidate {
  physicianId: string;
  totalScore: number;
  breakdown: ScoreBreakdown;
  availability: Availability;
  headroom: number;
}

export interface AutoFillConfig {
  weightPreference: number;
  weightHolidayParity: number;
  weightWorkloadSpread: number;
  weightRotationVariety: number;
  weightGapEnforcement: number;
  majorHolidayNames: string[];
  minGapWeeksBetweenStints: number;
}

export const DEFAULT_AUTO_FILL_CONFIG: AutoFillConfig = {
  weightPreference: 30,
  weightHolidayParity: 25,
  weightWorkloadSpread: 20,
  weightRotationVariety: 15,
  weightGapEnforcement: 10,
  majorHolidayNames: ["Thanksgiving Day", "Christmas Day"],
  minGapWeeksBetweenStints: 2,
};

export interface RotationPreference {
  preferenceRank: number | null;
  avoid: boolean;
  deprioritize: boolean;
}

// ========================================
// Same-week conflict prevention
// ========================================

/**
 * Build a map of weekId -> Set<physicianId> from existing assignments.
 * Used to prevent assigning a physician to multiple rotations in the same week.
 */
export function buildWeekToPhysicianMap(
  assignments: Array<{ weekId: string; physicianId: string | null | undefined }>,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const a of assignments) {
    if (!a.physicianId) continue;
    let set = map.get(a.weekId);
    if (!set) {
      set = new Set<string>();
      map.set(a.weekId, set);
    }
    set.add(a.physicianId);
  }
  return map;
}

/**
 * Check if a physician is already assigned to any rotation in this week.
 */
export function hasWeekConflict(
  weekToPhysicianMap: Map<string, Set<string>>,
  weekId: string,
  physicianId: string,
): boolean {
  const assigned = weekToPhysicianMap.get(weekId);
  return assigned !== undefined && assigned.has(physicianId);
}

// ========================================
// Seeded PRNG for deterministic shuffling
// ========================================

/**
 * Simple seeded PRNG (mulberry32) for deterministic shuffling.
 * Ensures same input produces same auto-fill results.
 */
export function createSeededRng(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle with seeded PRNG for deterministic results.
 */
export function seededShuffle<T>(array: T[], rng: () => number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generate a numeric seed from a string (e.g., fiscal year ID).
 */
export function hashStringToSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash;
}
