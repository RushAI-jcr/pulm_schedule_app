/**
 * Calculate a physician's accumulated cFTE for a fiscal year.
 *
 * cFTE has two components:
 *
 * 1. CLINIC cFTE (recurring half-day sessions)
 *    = Σ (halfDaysPerWeek × cftePerHalfDay × activeWeeks) for each clinic assignment
 *
 * 2. ROTATION cFTE (weekly inpatient/service assignments)
 *    = Σ (cftePerWeek for each assigned rotation-week on the master calendar)
 *
 * TOTAL = Clinic cFTE + Rotation cFTE
 * COMPARE against physician's targetCfte
 */

interface ClinicAssignment {
  halfDaysPerWeek: number;
  cftePerHalfDay: number;
  activeWeeks: number;
}

interface RotationAssignment {
  cftePerWeek: number;
  weekCount: number; // how many weeks assigned to this rotation
}

export function calculateClinicCfte(clinics: ClinicAssignment[]): number {
  return clinics.reduce(
    (sum, c) => sum + c.halfDaysPerWeek * c.cftePerHalfDay * c.activeWeeks,
    0
  );
}

export function calculateRotationCfte(rotations: RotationAssignment[]): number {
  return rotations.reduce(
    (sum, r) => sum + r.cftePerWeek * r.weekCount,
    0
  );
}

export function calculateTotalCfte(
  clinics: ClinicAssignment[],
  rotations: RotationAssignment[]
): {
  clinicCfte: number;
  rotationCfte: number;
  totalCfte: number;
} {
  const clinicCfte = calculateClinicCfte(clinics);
  const rotationCfte = calculateRotationCfte(rotations);
  return {
    clinicCfte: round4(clinicCfte),
    rotationCfte: round4(rotationCfte),
    totalCfte: round4(clinicCfte + rotationCfte),
  };
}

export function getCfteStatus(
  totalCfte: number,
  targetCfte: number
): "compliant" | "under" | "over" {
  const ratio = totalCfte / targetCfte;
  if (ratio < 0.95) return "under";
  if (ratio > 1.05) return "over";
  return "compliant";
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
