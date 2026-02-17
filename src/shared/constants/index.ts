import { AvailabilityOption } from "@/shared/types";

export const availabilityOptions: AvailabilityOption[] = [
  { value: "green", label: "Green - OK to work" },
  { value: "yellow", label: "Yellow - Prefer not to" },
  { value: "red", label: "Red - Do not schedule" },
];

export const defaultClinicTypeNames = [
  "Pulmonary RAB",
  "Sleep Clinic",
  "CF Clinic",
  "Pulmonary South Loop",
  "Pulmonary Oak Park",
];
