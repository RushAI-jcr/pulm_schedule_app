export type Availability = "green" | "yellow" | "red";

export interface AvailabilityOption {
  value: Availability;
  label: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface ClinicType {
  id: string;
  name: string;
}

export interface ScheduleEntry {
  id: string;
  physicianId: string;
  clinicTypeId: string;
  date: string;
  availability: Availability;
}
