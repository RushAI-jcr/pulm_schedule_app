import { type ParsedUploadPayload, doesDoctorTokenMatch, normalizeFiscalYearLabel } from "./scheduleImport"

export type ImportTargetPhysician = {
  id?: string
  lastName: string
  initials: string
}

export type FiscalWeekLite = {
  startDate: string
}

function firstUnique(values: string[], limit = 3): string[] {
  return Array.from(new Set(values)).slice(0, limit)
}

export function validateParsedUpload(params: {
  payload: ParsedUploadPayload | null
  fiscalYearLabel: string | null | undefined
  targetPhysician: ImportTargetPhysician | null
  fiscalWeeks: FiscalWeekLite[]
}): string | null {
  const { payload, fiscalYearLabel, targetPhysician, fiscalWeeks } = params
  if (!payload || !fiscalYearLabel || !targetPhysician) {
    return null
  }

  const parsedFy = normalizeFiscalYearLabel(payload.sourceFiscalYearLabel)
  const activeFy = normalizeFiscalYearLabel(fiscalYearLabel)
  if (parsedFy !== activeFy) {
    return `File fiscal year ${parsedFy} does not match active fiscal year ${activeFy}.`
  }

  if (
    !doesDoctorTokenMatch(payload.sourceDoctorToken, {
      lastName: targetPhysician.lastName,
      initials: targetPhysician.initials,
    })
  ) {
    return `File doctor token ${payload.sourceDoctorToken} does not match ${targetPhysician.lastName} (${targetPhysician.initials}).`
  }

  const expectedWeekStarts = fiscalWeeks.map((week) => week.startDate)
  const uploadedWeekStarts = payload.weeks.map((week) => week.weekStart)

  if (expectedWeekStarts.length !== uploadedWeekStarts.length) {
    return `File must include exactly ${expectedWeekStarts.length} weeks; found ${uploadedWeekStarts.length}.`
  }

  const expectedSet = new Set(expectedWeekStarts)
  const uploadedSet = new Set(uploadedWeekStarts)

  const duplicates = uploadedWeekStarts.filter(
    (weekStart, index) => uploadedWeekStarts.indexOf(weekStart) !== index,
  )
  if (duplicates.length > 0) {
    return `File contains duplicate week_start values: ${firstUnique(duplicates).join(", ")}`
  }

  const unknown = uploadedWeekStarts.filter((weekStart) => !expectedSet.has(weekStart))
  if (unknown.length > 0) {
    return `File contains unknown week_start values: ${firstUnique(unknown).join(", ")}`
  }

  const missing = expectedWeekStarts.filter((weekStart) => !uploadedSet.has(weekStart))
  if (missing.length > 0) {
    return `File is missing week_start values: ${firstUnique(missing).join(", ")}`
  }

  return null
}
