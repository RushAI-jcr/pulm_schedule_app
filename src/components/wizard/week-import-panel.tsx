"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useMutation } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/shared/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  MAX_IMPORT_FILE_BYTES,
  parseScheduleImportFile,
  type ParsedUploadPayload,
  type UploadAvailability,
} from "@/shared/services/scheduleImport"
import { validateParsedUpload } from "@/shared/services/scheduleImportValidation"

export type WeekImportMode = "self" | "admin"

export type WeekImportTarget = {
  id: Id<"physicians">
  firstName: string
  lastName: string
  initials: string
}

type SaveStatus = "idle" | "saving" | "saved" | "error"

export function WeekImportPanel({
  mode,
  readOnly = false,
  fiscalYearLabel,
  fiscalWeeks,
  targets,
  defaultTargetId,
  onSaveStatusChange,
}: {
  mode: WeekImportMode
  readOnly?: boolean
  fiscalYearLabel: string | null | undefined
  fiscalWeeks: Array<{ _id: Id<"weeks">; startDate: string }>
  targets: WeekImportTarget[]
  defaultTargetId?: Id<"physicians"> | null
  onSaveStatusChange?: (status: SaveStatus) => void
}) {
  const importWeekPreferences = useMutation(api.functions.scheduleRequests.importWeekPreferencesFromUpload)
  const maxUploadSizeMb = Math.round(MAX_IMPORT_FILE_BYTES / (1024 * 1024))

  const targetById = useMemo(
    () => new Map(targets.map((target) => [String(target.id), target])),
    [targets],
  )

  const [selectedTargetId, setSelectedTargetId] = useState(
    defaultTargetId ? String(defaultTargetId) : "",
  )
  const [importFileName, setImportFileName] = useState("")
  const [parsedImport, setParsedImport] = useState<ParsedUploadPayload | null>(null)
  const [parsingImport, setParsingImport] = useState(false)
  const [importingWeeks, setImportingWeeks] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importResultMessage, setImportResultMessage] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== "admin") return
    if (selectedTargetId && targetById.has(selectedTargetId)) return

    if (defaultTargetId && targetById.has(String(defaultTargetId))) {
      setSelectedTargetId(String(defaultTargetId))
      return
    }
    if (targets.length > 0) {
      setSelectedTargetId(String(targets[0].id))
      return
    }
    setSelectedTargetId("")
  }, [mode, defaultTargetId, selectedTargetId, targetById, targets])

  const selectedTarget = useMemo(() => {
    if (mode === "self") {
      return targets[0] ?? null
    }
    return selectedTargetId ? (targetById.get(selectedTargetId) ?? null) : null
  }, [mode, selectedTargetId, targetById, targets])

  const importValidationError = useMemo(
    () =>
      validateParsedUpload({
        payload: parsedImport,
        fiscalYearLabel,
        targetPhysician: selectedTarget
          ? {
              id: String(selectedTarget.id),
              lastName: selectedTarget.lastName,
              initials: selectedTarget.initials,
            }
          : null,
        fiscalWeeks,
      }),
    [fiscalWeeks, fiscalYearLabel, parsedImport, selectedTarget],
  )

  const handleParseImportFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return

    setParsingImport(true)
    setImportError(null)
    setImportResultMessage(null)
    setParsedImport(null)
    setImportFileName(file.name)

    try {
      const parsed = await parseScheduleImportFile(file)
      setParsedImport(parsed)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to parse upload file"
      setImportError(message)
    } finally {
      setParsingImport(false)
    }
  }, [])

  const handleImport = useCallback(async () => {
    if (!parsedImport || !selectedTarget || importValidationError) {
      return
    }

    onSaveStatusChange?.("saving")
    setImportingWeeks(true)
    setImportError(null)
    setImportResultMessage(null)

    try {
      const result = await importWeekPreferences({
        targetPhysicianId: mode === "admin" ? selectedTarget.id : undefined,
        sourceFileName: parsedImport.sourceFileName,
        sourceDoctorToken: parsedImport.sourceDoctorToken,
        sourceFiscalYearLabel: parsedImport.sourceFiscalYearLabel,
        weeks: parsedImport.weeks.map((week) => ({
          weekStart: week.weekStart,
          weekEnd: week.weekEnd ?? undefined,
          availability: week.availability,
        })),
      })
      setImportResultMessage(
        `${result.message}. Imported: ${result.importedCount}, cleared (unset): ${result.clearedCount}.`,
      )
      onSaveStatusChange?.("saved")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import week preferences"
      setImportError(message)
      onSaveStatusChange?.("error")
    } finally {
      setImportingWeeks(false)
    }
  }, [importValidationError, importWeekPreferences, mode, onSaveStatusChange, parsedImport, selectedTarget])

  const canImport =
    !readOnly &&
    !parsingImport &&
    !importingWeeks &&
    !!parsedImport &&
    !importValidationError &&
    !!selectedTarget

  return (
    <section className="space-y-3 rounded-lg border p-3">
      <h3 className="text-sm font-semibold">
        {mode === "admin"
          ? "Import Week Preferences (Admin)"
          : "Import Week Preferences"}
      </h3>
      <p className="text-xs text-muted-foreground">
        Upload `.xlsx` or `.csv` (`week_start`, `preference`) up to {maxUploadSizeMb}MB to replace week preferences for the selected physician.
      </p>

      {mode === "admin" && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Target physician</label>
          <Select
            value={selectedTargetId}
            onValueChange={setSelectedTargetId}
            disabled={readOnly || targets.length === 0 || importingWeeks}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder={targets.length === 0 ? "No active physicians" : "Select physician"} />
            </SelectTrigger>
            <SelectContent>
              {targets.map((target) => (
                <SelectItem key={String(target.id)} value={String(target.id)}>
                  {target.lastName}, {target.firstName} ({target.initials})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Upload file</label>
        <input
          type="file"
          accept=".xlsx,.csv"
          disabled={readOnly || parsingImport || importingWeeks || !selectedTarget}
          onChange={(event) => {
            const file = event.target.files?.[0]
            void handleParseImportFile(file)
            event.target.value = ""
          }}
          className="block w-full text-sm text-foreground file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent disabled:opacity-50"
        />
      </div>

      {readOnly && (
        <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
          Import is locked because this fiscal year is not in collecting status.
        </div>
      )}

      {importFileName ? (
        <p className="text-xs text-muted-foreground">
          Selected file: <span className="font-medium text-foreground">{importFileName}</span>
        </p>
      ) : null}

      {parsingImport ? (
        <div className="rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300">
          Parsing upload...
        </div>
      ) : null}

      {importError ? (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
          {importError}
        </div>
      ) : null}

      {parsedImport ? (
        <div className="space-y-2 rounded border bg-muted/30 p-2">
          <div className="text-xs">
            <span className="font-medium">Doctor token:</span> {parsedImport.sourceDoctorToken}
          </div>
          <div className="text-xs">
            <span className="font-medium">Fiscal year:</span> {parsedImport.sourceFiscalYearLabel}
          </div>
          <div className="text-xs">
            <span className="font-medium">Weeks parsed:</span> {parsedImport.weeks.length}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["red", "yellow", "green", "unset"] as UploadAvailability[]).map((value) => (
              <span key={value} className="rounded border bg-background px-2 py-1 text-xs">
                {value}: {parsedImport.counts[value]}
              </span>
            ))}
          </div>
          {importValidationError ? (
            <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
              {importValidationError}
            </div>
          ) : (
            <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300">
              Upload validation passed.
            </div>
          )}
        </div>
      ) : null}

      {importResultMessage ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300">
          {importResultMessage}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => void handleImport()}
          disabled={!canImport}
        >
          {importingWeeks ? "Importing..." : mode === "admin" ? "Import for Physician" : "Import Preferences"}
        </Button>
      </div>
    </section>
  )
}
