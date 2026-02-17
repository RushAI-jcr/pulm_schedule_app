export function isValidTargetCfte(targetCfte: number): boolean {
  return Number.isFinite(targetCfte) && targetCfte >= 0 && targetCfte <= 1.5;
}
