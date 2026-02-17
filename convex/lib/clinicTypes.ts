export function normalizeClinicTypeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function hasDuplicateClinicTypeName(existingNames: string[], candidate: string): boolean {
  const normalizedCandidate = normalizeClinicTypeName(candidate).toLowerCase();
  return existingNames.some((name) => normalizeClinicTypeName(name).toLowerCase() === normalizedCandidate);
}
