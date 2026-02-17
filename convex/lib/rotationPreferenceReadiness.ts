export const REQUIRED_INPATIENT_ROTATION_NAMES = [
  "Pulm",
  "MICU 1",
  "MICU 2",
  "AICU",
  "LTAC",
  "ROPH",
  "IP",
  "PFT",
] as const;

function normalizeRotationName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function getRotationConfigurationIssues(activeRotationNames: string[]) {
  const expectedByNormalized = new Map(
    REQUIRED_INPATIENT_ROTATION_NAMES.map((name) => [normalizeRotationName(name), name]),
  );
  const activeByNormalized = new Map(activeRotationNames.map((name) => [normalizeRotationName(name), name]));

  const missingRequiredNames = Array.from(expectedByNormalized.entries())
    .filter(([normalized]) => !activeByNormalized.has(normalized))
    .map(([, canonicalName]) => canonicalName);

  const unexpectedNames = Array.from(activeByNormalized.entries())
    .filter(([normalized]) => !expectedByNormalized.has(normalized))
    .map(([, rawName]) => rawName)
    .sort((a, b) => a.localeCompare(b));

  return {
    isValid: missingRequiredNames.length === 0 && unexpectedNames.length === 0,
    missingRequiredNames,
    unexpectedNames,
  };
}

export function getMissingActiveRotationIds(args: {
  activeRotationIds: string[];
  configuredRotationIds: string[];
}) {
  const configured = new Set(args.configuredRotationIds);
  return args.activeRotationIds.filter((rotationId) => !configured.has(rotationId));
}

