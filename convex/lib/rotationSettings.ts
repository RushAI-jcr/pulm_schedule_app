export function validateRotationSettingsInput(args: {
  cftePerWeek: number;
  minStaff: number;
  maxConsecutiveWeeks: number;
}) {
  if (!Number.isFinite(args.cftePerWeek) || args.cftePerWeek <= 0) {
    throw new Error("cFTE/week must be a positive number");
  }
  if (!Number.isInteger(args.minStaff) || args.minStaff < 0) {
    throw new Error("Min staff must be a whole number greater than or equal to 0");
  }
  if (
    !Number.isInteger(args.maxConsecutiveWeeks) ||
    args.maxConsecutiveWeeks < 1 ||
    args.maxConsecutiveWeeks > 52
  ) {
    throw new Error("Max consecutive weeks must be an integer between 1 and 52");
  }

  return {
    cftePerWeek: args.cftePerWeek,
    minStaff: args.minStaff,
    maxConsecutiveWeeks: args.maxConsecutiveWeeks,
  };
}

export function assertRotationBelongsToFiscalYear(params: {
  rotationFiscalYearId: string;
  activeFiscalYearId: string;
}) {
  if (params.rotationFiscalYearId !== params.activeFiscalYearId) {
    throw new Error("Rotation does not belong to the active fiscal year");
  }
}

