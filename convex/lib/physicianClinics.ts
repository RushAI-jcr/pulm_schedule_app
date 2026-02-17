export function isValidHalfDaysPerWeek(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 10;
}

export function isValidActiveWeeks(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 52;
}
