/**
 * Physician-specific consecutive week preferences
 *
 * Based on analysis of FY 2025-2026 actual calendar patterns.
 *
 * Default: 1 week at a time for all rotations
 * Exceptions documented below.
 */

export interface PhysicianConsecutiveRule {
  physicianInitials: string;
  rotationAbbreviation: string;
  maxConsecutiveWeeks: number;
}

/**
 * Physician-specific max consecutive week overrides.
 *
 * These override the rotation-level maxConsecutiveWeeks for specific physicians.
 */
export const PHYSICIAN_CONSECUTIVE_WEEK_RULES: PhysicianConsecutiveRule[] = [
  // Jared G (JG) - Prefers 2 consecutive weeks for intensive care rotations
  { physicianInitials: "JG", rotationAbbreviation: "MICU 1", maxConsecutiveWeeks: 2 },
  { physicianInitials: "JG", rotationAbbreviation: "MICU 2", maxConsecutiveWeeks: 2 },
  { physicianInitials: "JG", rotationAbbreviation: "AICU", maxConsecutiveWeeks: 2 },

  // Waj Lodhi (WL) - Can do 2 consecutive weeks for ROPH
  { physicianInitials: "WL", rotationAbbreviation: "ROPH", maxConsecutiveWeeks: 2 },

  // David Gurka (DPG) - Can do 2 consecutive weeks for LTAC
  { physicianInitials: "DPG", rotationAbbreviation: "LTAC", maxConsecutiveWeeks: 2 },
];

/**
 * Get the max consecutive weeks for a specific physician and rotation.
 *
 * Returns the physician-specific override if it exists, otherwise falls back
 * to the rotation's default max consecutive weeks.
 *
 * @param physicianInitials - Physician initials (e.g., "JG", "WL", "DPG")
 * @param rotationAbbreviation - Rotation abbreviation (e.g., "MICU 1", "ROPH", "LTAC")
 * @param rotationMaxConsecutive - Rotation's default max consecutive weeks (fallback)
 * @returns Max consecutive weeks for this physician-rotation combination
 */
export function getPhysicianMaxConsecutiveWeeks(
  physicianInitials: string,
  rotationAbbreviation: string,
  rotationMaxConsecutive: number,
): number {
  const rule = PHYSICIAN_CONSECUTIVE_WEEK_RULES.find(
    (r) =>
      r.physicianInitials === physicianInitials &&
      r.rotationAbbreviation === rotationAbbreviation,
  );

  return rule?.maxConsecutiveWeeks ?? rotationMaxConsecutive;
}

/**
 * Check if a physician prefers consecutive weeks for a rotation.
 *
 * @param physicianInitials - Physician initials
 * @param rotationAbbreviation - Rotation abbreviation
 * @returns True if physician has a consecutive week preference for this rotation
 */
export function hasConsecutiveWeekPreference(
  physicianInitials: string,
  rotationAbbreviation: string,
): boolean {
  return PHYSICIAN_CONSECUTIVE_WEEK_RULES.some(
    (r) =>
      r.physicianInitials === physicianInitials &&
      r.rotationAbbreviation === rotationAbbreviation,
  );
}
