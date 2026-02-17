import { Doc } from "../_generated/dataModel";

export function sortWeeksByWeekNumber(weeks: Doc<"weeks">[]) {
  return [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);
}

export function sortActiveRotations(rotations: Doc<"rotations">[]) {
  return rotations
    .filter((rotation) => rotation.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function sortActivePhysicians(physicians: Doc<"physicians">[]) {
  return physicians
    .filter((physician) => physician.isActive)
    .sort((a, b) => {
      const byLast = a.lastName.localeCompare(b.lastName);
      if (byLast !== 0) return byLast;
      return a.firstName.localeCompare(b.firstName);
    });
}
