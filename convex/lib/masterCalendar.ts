export function getNextMasterCalendarVersion(existingVersions: number[]): number {
  if (existingVersions.length === 0) return 1;
  return Math.max(...existingVersions) + 1;
}
