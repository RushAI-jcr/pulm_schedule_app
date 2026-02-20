"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { useQuery, useMutation } from "convex/react"
import {
  Calendar,
  Plus,
  Wand2,
  Upload,
  Download,
  Printer,
  Settings2,
  FileText,
  Undo2,
  AlertTriangle,
  Loader2,
} from "lucide-react"
import { api } from "../../../../../convex/_generated/api"
import type { Id } from "../../../../../convex/_generated/dataModel"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { PageSkeleton } from "@/components/shared/loading-skeleton"
import { Button } from "@/shared/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { AutoFillConfigPanel } from "@/components/admin/auto-fill-config-panel"
import { AutoFillMetricsCard } from "@/components/admin/auto-fill-metrics-card"
import { AutoFillDecisionLog } from "@/components/admin/auto-fill-decision-log"
import {
  WeekImportPanel,
  type WeekImportTarget,
  type WeekImportCompletedPayload,
} from "@/components/wizard/week-import-panel"
import { IcsExportButton } from "@/components/calendar/ics-export-button"
import { getRotationAccent } from "@/components/calendar/calendar-tokens"

interface AutoFillMetrics {
  totalCells: number
  filledCells: number
  unfilledCells: number
  avgScore: number
  holidayParityScore: number
  cfteVariance: number
  preferencesSatisfied: number
  workloadStdDev: number
}

type PhysicianAutoFillResult = {
  message: string
  assignedCount: number
  remainingUnstaffedCount: number
  warnings: string[]
  warningSummary: {
    missingRequest: boolean
    pendingApproval: boolean
    missingRotationPreferenceCount: number
  }
  physicianMetrics: {
    physicianId: Id<"physicians">
    initials: string
    assignedSlots: number
    assignedWeeks: number
    targetCfte: number
    rotationCfte: number
    clinicCfte: number
    totalCfte: number
    headroom: number
    isOverTarget: boolean
  }
  metrics: AutoFillMetrics
}

type OpState =
  | "idle"
  | "creating"
  | "auto_assigning"
  | "auto_assigning_physician"
  | "clearing"
  | "publishing"

function getServiceGroupLabel(rotation: { name: string; abbreviation: string }): string {
  const name = rotation.name.trim()
  const abbreviation = rotation.abbreviation.trim()
  const candidate = `${name} ${abbreviation}`.toUpperCase()
  if (candidate.includes("MICU")) return "MICU"
  return abbreviation || name
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csvRows = [headers, ...rows]
    .map((row) =>
      row
        .map((cell) => `"${cell.replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n")
  const blob = new Blob([csvRows], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function MasterCalendarPage() {
  const data = useQuery(api.functions.masterCalendar.getCurrentFiscalYearMasterCalendarDraft)
  const clinicData = useQuery(api.functions.physicianClinics.getCurrentFiscalYearPhysicianClinics)
  const physicianDirectory = useQuery(api.functions.physicians.getPhysicians)
  const createDraft = useMutation(api.functions.masterCalendar.createCurrentFiscalYearMasterCalendarDraft)
  const assignCell = useMutation(api.functions.masterCalendar.assignCurrentFiscalYearDraftCell)
  const autoAssign = useMutation(api.functions.masterCalendar.autoAssignCurrentFiscalYearDraft)
  const autoAssignForPhysician = useMutation(
    api.functions.masterCalendar.autoAssignCurrentFiscalYearDraftForPhysician,
  )
  const clearAutoFilled = useMutation(api.functions.masterCalendar.clearAutoFilledAssignments)
  const publishDraft = useMutation(api.functions.masterCalendar.publishCurrentFiscalYearMasterCalendarDraft)

  const [opState, setOpState] = useState<OpState>("idle")
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [decisionLogOpen, setDecisionLogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastMetrics, setLastMetrics] = useState<AutoFillMetrics | null>(null)
  const [lastPhysicianResult, setLastPhysicianResult] = useState<PhysicianAutoFillResult | null>(null)
  const [cellPending, setCellPending] = useState<Set<string>>(new Set())
  const [highlightPhysicianId, setHighlightPhysicianId] = useState<string | null>(null)
  const [selectedSchedulerPhysicianId, setSelectedSchedulerPhysicianId] = useState<string>("")
  const [lastImportFeedback, setLastImportFeedback] = useState<string | null>(null)
  const cellPendingRef = useRef(new Set<string>())

  const isCreating = opState === "creating"
  const isAutoAssigning = opState === "auto_assigning"
  const isPhysicianAutoAssigning = opState === "auto_assigning_physician"
  const isClearing = opState === "clearing"
  const isPublishing = opState === "publishing"
  const isBusy = opState !== "idle"

  // Must be before any early returns to satisfy Rules of Hooks
  const availabilityMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const entry of data?.availabilityEntries ?? []) {
      map.set(`${String(entry.physicianId)}:${String(entry.weekId)}`, entry.availability)
    }
    return map
  }, [data?.availabilityEntries])

  // Month break tracking for column separators and label row
  const { monthBreakSet, monthBreaks } = useMemo(() => {
    const breakSet = new Set<number>()
    const breaks: Array<{ weekIndex: number; label: string }> = []
    let lastMonth = -1
    ;(data?.grid ?? []).forEach((row, i) => {
      const d = new Date(row.startDate + "T00:00:00")
      const month = d.getMonth()
      if (month !== lastMonth) {
        breakSet.add(i)
        breaks.push({
          weekIndex: i,
          label: d.toLocaleDateString("en-US", { month: "short" }),
        })
        lastMonth = month
      }
    })
    return { monthBreakSet: breakSet, monthBreaks: breaks }
  }, [data?.grid])

  const serviceColumns = useMemo(() => {
    const services = new Set<string>()
    for (const rotation of data?.rotations ?? []) {
      services.add(getServiceGroupLabel({ name: rotation.name, abbreviation: rotation.abbreviation }))
    }
    return [...services].sort((a, b) => a.localeCompare(b))
  }, [data?.rotations])

  const calendarProgress = useMemo(() => {
    const byPhysician = new Map<string, { assignedCells: number; weeks: Set<string> }>()
    let totalSlots = 0
    let assignedSlots = 0

    for (const weekRow of data?.grid ?? []) {
      for (const cell of weekRow.cells) {
        totalSlots += 1
        if (!cell.physicianId) continue
        assignedSlots += 1

        const physicianKey = String(cell.physicianId)
        const existing = byPhysician.get(physicianKey) ?? {
          assignedCells: 0,
          weeks: new Set<string>(),
        }
        existing.assignedCells += 1
        existing.weeks.add(String(weekRow.weekId))
        byPhysician.set(physicianKey, existing)
      }
    }

    const totalWeeks = (data?.grid ?? []).length
    const physicianRows = (data?.physicians ?? [])
      .map((physician) => {
        const stats = byPhysician.get(String(physician._id))
        const assignedCells = stats?.assignedCells ?? 0
        const assignedWeeks = stats?.weeks.size ?? 0
        return {
          physicianId: String(physician._id),
          initials: physician.initials,
          fullName: physician.fullName,
          assignedCells,
          assignedWeeks,
          weekCoveragePct:
            totalWeeks > 0 ? Math.round((assignedWeeks / totalWeeks) * 100) : 0,
        }
      })
      .sort((a, b) => {
        if (b.assignedWeeks !== a.assignedWeeks) return b.assignedWeeks - a.assignedWeeks
        return a.initials.localeCompare(b.initials)
      })

    const selected = highlightPhysicianId
      ? physicianRows.find((row) => row.physicianId === highlightPhysicianId) ?? null
      : null
    const selectedCfte = selected
      ? data?.cfteSummary.find(
          (row) => String(row.physicianId) === selected.physicianId,
        ) ?? null
      : null
    const serviceByRotationId = new Map<string, string>()
    const rotationCfteByRotationId = new Map<string, number>()
    for (const rotation of data?.rotations ?? []) {
      serviceByRotationId.set(
        String(rotation._id),
        getServiceGroupLabel({ name: rotation.name, abbreviation: rotation.abbreviation }),
      )
      rotationCfteByRotationId.set(String(rotation._id), rotation.cftePerWeek)
    }
    const serviceStats = new Map<string, { weeks: number; rotationCfte: number }>()
    if (selected) {
      for (const weekRow of data?.grid ?? []) {
        for (const cell of weekRow.cells) {
          if (String(cell.physicianId) !== selected.physicianId) continue
          const service = serviceByRotationId.get(String(cell.rotationId)) ?? "Other"
          const existing = serviceStats.get(service) ?? { weeks: 0, rotationCfte: 0 }
          existing.weeks += 1
          existing.rotationCfte += rotationCfteByRotationId.get(String(cell.rotationId)) ?? 0
          serviceStats.set(service, existing)
        }
      }
    }
    const selectedServiceBreakdown = [...serviceStats.entries()]
      .map(([service, stats]) => ({
        service,
        weeks: stats.weeks,
        rotationCfte: stats.rotationCfte,
      }))
      .sort((a, b) => {
        if (b.weeks !== a.weeks) return b.weeks - a.weeks
        return a.service.localeCompare(b.service)
      })

    const clinicTypeById = new Map(
      (clinicData?.clinicTypes ?? []).map((clinicType) => [String(clinicType._id), clinicType]),
    )
    const selectedClinicBreakdown = selected
      ? (clinicData?.assignments ?? [])
          .filter((assignment) => String(assignment.physicianId) === selected.physicianId)
          .map((assignment) => {
            const clinicType = clinicTypeById.get(String(assignment.clinicTypeId))
            const annualHalfDays = assignment.halfDaysPerWeek * assignment.activeWeeks
            return {
              clinicName: clinicType?.name ?? "Unknown Clinic",
              halfDaysPerWeek: assignment.halfDaysPerWeek,
              activeWeeks: assignment.activeWeeks,
              annualHalfDays,
              annualClinicCfte: annualHalfDays * (clinicType?.cftePerHalfDay ?? 0),
            }
          })
          .sort((a, b) => {
            if (b.annualClinicCfte !== a.annualClinicCfte) {
              return b.annualClinicCfte - a.annualClinicCfte
            }
            return a.clinicName.localeCompare(b.clinicName)
          })
      : []
    const clinicHalfDaysAnnualTotal = selectedClinicBreakdown.reduce(
      (total, row) => total + row.annualHalfDays,
      0,
    )
    const clinicCfteAnnualTotal = selectedClinicBreakdown.reduce(
      (total, row) => total + row.annualClinicCfte,
      0,
    )

    return {
      totalSlots,
      assignedSlots,
      unassignedSlots: totalSlots - assignedSlots,
      completionPct: totalSlots > 0 ? Math.round((assignedSlots / totalSlots) * 100) : 0,
      totalWeeks,
      physicianRows,
      selected,
      selectedCfte,
      selectedServiceBreakdown,
      selectedClinicBreakdown,
      clinicHalfDaysAnnualTotal,
      clinicCfteAnnualTotal,
    }
  }, [
    clinicData?.assignments,
    clinicData?.clinicTypes,
    data?.cfteSummary,
    data?.grid,
    data?.physicians,
    data?.rotations,
    highlightPhysicianId,
  ])

  const importTargets = useMemo<WeekImportTarget[]>(() => {
    if (!physicianDirectory) return []
    return physicianDirectory
      .filter((physician) => physician.isActive)
      .map((physician) => ({
        id: physician._id,
        firstName: physician.firstName,
        lastName: physician.lastName,
        initials: physician.initials,
      }))
  }, [physicianDirectory])

  useEffect(() => {
    const physicianIds = new Set((data?.physicians ?? []).map((physician) => String(physician._id)))
    if (physicianIds.size === 0) {
      if (selectedSchedulerPhysicianId) setSelectedSchedulerPhysicianId("")
      return
    }
    if (selectedSchedulerPhysicianId && physicianIds.has(selectedSchedulerPhysicianId)) return

    const fallback =
      highlightPhysicianId && physicianIds.has(highlightPhysicianId)
        ? highlightPhysicianId
        : String(data?.physicians?.[0]?._id)
    setSelectedSchedulerPhysicianId(fallback)
  }, [data?.physicians, highlightPhysicianId, selectedSchedulerPhysicianId])

  const selectedSchedulerPhysician = useMemo(
    () =>
      data?.physicians.find(
        (physician) => String(physician._id) === selectedSchedulerPhysicianId,
      ) ?? null,
    [data?.physicians, selectedSchedulerPhysicianId],
  )

  const selectedPhysicianScheduleRows = useMemo(() => {
    if (!data || !selectedSchedulerPhysicianId) return []

    return data.grid
      .map((weekRow) => {
        const assignedCell = weekRow.cells.find(
          (cell) => String(cell.physicianId ?? "") === selectedSchedulerPhysicianId,
        )
        if (!assignedCell) return null

        const rotation = data.rotations.find(
          (candidate) => String(candidate._id) === String(assignedCell.rotationId),
        )
        if (!rotation) return null

        return {
          weekNumber: weekRow.weekNumber,
          weekStart: weekRow.startDate,
          weekEnd: weekRow.endDate,
          rotationName: rotation.name,
          rotationAbbreviation: rotation.abbreviation,
        }
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => a.weekNumber - b.weekNumber)
  }, [data, selectedSchedulerPhysicianId])

  const exportCalendarData = useMemo(() => {
    if (!data) return null

    const physicianById = new Map(
      data.physicians.map((physician) => [String(physician._id), physician]),
    )

    return {
      fiscalYear: data.fiscalYear ? { label: data.fiscalYear.label } : null,
      grid: data.grid.map((weekRow) => ({
        weekId: String(weekRow.weekId),
        weekNumber: weekRow.weekNumber,
        startDate: weekRow.startDate,
        endDate: weekRow.endDate,
        cells: weekRow.cells.map((cell) => {
          const physicianId = cell.physicianId ? String(cell.physicianId) : null
          const physician = physicianId ? physicianById.get(physicianId) ?? null : null
          return {
            rotationId: String(cell.rotationId),
            assignmentId: cell.assignmentId ? String(cell.assignmentId) : null,
            physicianId,
            physicianName: physician?.fullName ?? null,
            physicianInitials: physician?.initials ?? null,
          }
        }),
      })),
      rotations: data.rotations.map((rotation) => ({
        _id: rotation._id,
        name: rotation.name,
        abbreviation: rotation.abbreviation,
      })),
      events: [],
    }
  }, [data])

  const annualReportRows = useMemo(() => {
    const serviceByRotationId = new Map<string, string>()
    for (const rotation of data?.rotations ?? []) {
      serviceByRotationId.set(
        String(rotation._id),
        getServiceGroupLabel({ name: rotation.name, abbreviation: rotation.abbreviation }),
      )
    }

    const serviceWeeksByPhysician = new Map<string, Map<string, number>>()
    for (const weekRow of data?.grid ?? []) {
      for (const cell of weekRow.cells) {
        if (!cell.physicianId) continue
        const physicianId = String(cell.physicianId)
        const service = serviceByRotationId.get(String(cell.rotationId)) ?? "Other"
        const existingServiceMap = serviceWeeksByPhysician.get(physicianId) ?? new Map<string, number>()
        existingServiceMap.set(service, (existingServiceMap.get(service) ?? 0) + 1)
        serviceWeeksByPhysician.set(physicianId, existingServiceMap)
      }
    }

    const clinicHalfDaysByPhysician = new Map<string, number>()
    for (const assignment of clinicData?.assignments ?? []) {
      const physicianId = String(assignment.physicianId)
      const annualHalfDays = assignment.halfDaysPerWeek * assignment.activeWeeks
      clinicHalfDaysByPhysician.set(
        physicianId,
        (clinicHalfDaysByPhysician.get(physicianId) ?? 0) + annualHalfDays,
      )
    }

    const cfteByPhysician = new Map(
      (data?.cfteSummary ?? []).map((row) => [String(row.physicianId), row]),
    )
    const workloadByPhysician = new Map(
      calendarProgress.physicianRows.map((row) => [row.physicianId, row]),
    )

    return (data?.physicians ?? [])
      .map((physician) => {
        const physicianId = String(physician._id)
        const cfte = cfteByPhysician.get(physicianId) ?? null
        const workload = workloadByPhysician.get(physicianId)
        const serviceWeeksMap = serviceWeeksByPhysician.get(physicianId) ?? new Map<string, number>()
        const serviceWeeks: Record<string, number> = {}
        for (const service of serviceColumns) {
          serviceWeeks[service] = serviceWeeksMap.get(service) ?? 0
        }
        return {
          physicianId,
          physicianName: physician.fullName,
          initials: physician.initials,
          assignedWeeks: workload?.assignedWeeks ?? 0,
          assignedSlots: workload?.assignedCells ?? 0,
          coveragePct: workload?.weekCoveragePct ?? 0,
          serviceWeeks,
          clinicHalfDaysAnnual: clinicHalfDaysByPhysician.get(physicianId) ?? 0,
          rotationCfte: cfte?.rotationCfte ?? 0,
          clinicCfte: cfte?.clinicCfte ?? 0,
          totalCfte: cfte?.totalCfte ?? 0,
          targetCfte: cfte?.targetCfte ?? null,
          targetMet:
            cfte?.targetCfte !== null && cfte?.targetCfte !== undefined
              ? !cfte.isOverTarget
              : null,
        }
      })
      .sort((a, b) => a.physicianName.localeCompare(b.physicianName))
  }, [
    calendarProgress.physicianRows,
    clinicData?.assignments,
    data?.cfteSummary,
    data?.grid,
    data?.physicians,
    data?.rotations,
    serviceColumns,
  ])

  if (data === undefined) {
    return (
      <>
        <PageHeader title="Master Calendar" description="Build and publish the department schedule" />
        <PageSkeleton />
      </>
    )
  }

  if (!data.fiscalYear) {
    return (
      <>
        <PageHeader title="Master Calendar" description="Build and publish the department schedule" />
        <div className="flex-1 p-6">
          <EmptyState
            icon={Calendar}
            title="No active fiscal year"
            description="Create and activate a fiscal year in Settings first."
          />
        </div>
      </>
    )
  }

  const handleCreateDraft = async () => {
    if (opState !== "idle") return
    setOpState("creating")
    setError(null)
    try {
      await createDraft({})
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create draft")
    } finally {
      setOpState("idle")
    }
  }

  const handleAutoAssign = async () => {
    if (opState !== "idle") return
    setOpState("auto_assigning")
    setError(null)
    setLastMetrics(null)
    setLastPhysicianResult(null)
    try {
      const result = await autoAssign({})
      setLastMetrics(result.metrics)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-assign failed")
    } finally {
      setOpState("idle")
    }
  }

  const handleAutoAssignSelectedPhysician = async () => {
    if (opState !== "idle") return
    if (!selectedSchedulerPhysicianId) {
      setError("Select a physician before running physician auto-fill")
      return
    }

    setOpState("auto_assigning_physician")
    setError(null)
    setLastMetrics(null)
    try {
      const result = await autoAssignForPhysician({
        physicianId: selectedSchedulerPhysicianId as Id<"physicians">,
        replaceExistingAutoAssignments: true,
      })
      setLastPhysicianResult(result)
      setHighlightPhysicianId(selectedSchedulerPhysicianId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Physician auto-fill failed")
    } finally {
      setOpState("idle")
    }
  }

  const handleImportCompleted = (payload: WeekImportCompletedPayload) => {
    const physicianId = String(payload.physicianId)
    setSelectedSchedulerPhysicianId(physicianId)
    setHighlightPhysicianId(physicianId)
    setLastImportFeedback(
      `Imported ${payload.importedCount} week preferences for ${payload.physicianName} (${payload.physicianInitials}) from ${payload.sourceFileName}.`,
    )
  }

  const handleClearAutoFilled = async () => {
    if (opState !== "idle") return
    setOpState("clearing")
    setError(null)
    try {
      await clearAutoFilled({})
      setLastMetrics(null)
      setLastPhysicianResult(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear auto-filled assignments")
    } finally {
      setOpState("idle")
    }
  }

  const handlePublish = async () => {
    if (opState !== "idle") return
    setOpState("publishing")
    setError(null)
    try {
      await publishDraft({})
      setPublishDialogOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed")
    } finally {
      setOpState("idle")
    }
  }

  const handleAssignCell = async (weekId: string, rotationId: string, physicianId: string | null) => {
    if (opState !== "idle") return
    const cellKey = `${weekId}:${rotationId}`
    if (cellPendingRef.current.has(cellKey)) return
    cellPendingRef.current.add(cellKey)
    setCellPending(new Set(cellPendingRef.current))
    try {
      await assignCell({
        weekId: weekId as Id<"weeks">,
        rotationId: rotationId as Id<"rotations">,
        physicianId: physicianId ? (physicianId as Id<"physicians">) : undefined,
      })
    } catch {
      // Error will show in Convex
    } finally {
      cellPendingRef.current.delete(cellKey)
      setCellPending(new Set(cellPendingRef.current))
    }
  }

  const handleExportAnnualReport = () => {
    if (!data?.fiscalYear || annualReportRows.length === 0) return
    const headers = [
      "Physician",
      "Initials",
      "Assigned Weeks",
      "Assigned Slots",
      "Week Coverage %",
      ...serviceColumns.map((service) => `${service} Weeks`),
      "Rotation cFTE",
      "Clinic Half-Days (Annual)",
      "Clinic cFTE",
      "Total cFTE",
      "Target cFTE",
      "Target Met",
    ]
    const rows = annualReportRows.map((row) => [
      row.physicianName,
      row.initials,
      String(row.assignedWeeks),
      String(row.assignedSlots),
      String(row.coveragePct),
      ...serviceColumns.map((service) => String(row.serviceWeeks[service] ?? 0)),
      row.rotationCfte.toFixed(2),
      String(row.clinicHalfDaysAnnual),
      row.clinicCfte.toFixed(2),
      row.totalCfte.toFixed(2),
      row.targetCfte === null ? "N/A" : row.targetCfte.toFixed(2),
      row.targetMet === null ? "N/A" : row.targetMet ? "Yes" : "No",
    ])
    const safeLabel = data.fiscalYear.label.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()
    downloadCsv(`master-calendar-annual-report-${safeLabel}.csv`, headers, rows)
  }

  const handlePrintAnnualReport = () => {
    window.print()
  }

  const handleExportSelectedPhysicianCsv = () => {
    if (!data?.fiscalYear || !selectedSchedulerPhysician || selectedPhysicianScheduleRows.length === 0) return

    const headers = ["Week", "Start Date", "End Date", "Rotation", "Abbreviation"]
    const rows = selectedPhysicianScheduleRows.map((row) => [
      String(row.weekNumber),
      row.weekStart,
      row.weekEnd,
      row.rotationName,
      row.rotationAbbreviation,
    ])

    const safeLabel = data.fiscalYear.label.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()
    const safeInitials = selectedSchedulerPhysician.initials.toLowerCase()
    downloadCsv(`doctor-schedule-${safeLabel}-${safeInitials}.csv`, headers, rows)
  }

  const hasDraft = !!data.calendar
  const isDraft = data.calendar?.status === "draft"
  const importReadOnly =
    data.fiscalYear.status !== "collecting" && data.fiscalYear.status !== "building"

  return (
    <>
      <PageHeader
        title="Master Calendar"
        description={`${data.fiscalYear.label} · ${data.fiscalYear.status}`}
        actions={
          <div className="flex items-center gap-2">
            {!hasDraft && (
              <Button size="sm" onClick={handleCreateDraft} disabled={isBusy}>
                {isCreating && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                <Plus className="mr-1 h-4 w-4" />
                Create Draft
              </Button>
            )}
            {hasDraft && isDraft && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setConfigOpen(true)}>
                  <Settings2 className="mr-1 h-4 w-4" />
                  Settings
                </Button>
                <Button size="sm" variant="outline" onClick={handleAutoAssign} disabled={isBusy}>
                  {isAutoAssigning && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  <Wand2 className="mr-1 h-4 w-4" />
                  Auto-Fill
                </Button>
                <Button size="sm" variant="ghost" onClick={handleClearAutoFilled} disabled={isBusy}>
                  {isClearing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  <Undo2 className="mr-1 h-4 w-4" />
                  Undo Auto
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDecisionLogOpen(true)}>
                  <FileText className="mr-1 h-4 w-4" />
                  Log
                </Button>
                <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" disabled={isBusy}>
                      <Upload className="mr-1 h-4 w-4" />
                      Publish
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Publish Master Calendar?</DialogTitle>
                      <DialogDescription>
                        Publishing makes this calendar visible to all physicians. This action transitions the fiscal year to &quot;published&quot; status.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setPublishDialogOpen(false)}>Cancel</Button>
                      <Button onClick={handlePublish} disabled={isBusy}>
                        {isPublishing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                        Publish
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        }
      />
      <div className="flex-1 p-4 md:p-6 space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <span className="text-xs text-destructive">{error}</span>
          </div>
        )}

        {/* Auto-Fill Metrics (shown after auto-fill runs) */}
        {lastMetrics && (
          <AutoFillMetricsCard metrics={lastMetrics} />
        )}

        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Doctor XLS Intake</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upload one physician template at a time, then run physician-specific auto-fill from this page.
            </p>
          </div>

          <WeekImportPanel
            mode="admin"
            readOnly={importReadOnly}
            fiscalYearLabel={data.fiscalYear.label}
            fiscalWeeks={data.weeks.map((week) => ({ _id: week._id, startDate: week.startDate }))}
            targets={importTargets}
            defaultTargetId={
              selectedSchedulerPhysicianId
                ? (selectedSchedulerPhysicianId as Id<"physicians">)
                : importTargets[0]?.id ?? null
            }
            onImportCompleted={handleImportCompleted}
          />

          {lastImportFeedback && (
            <p className="text-xs text-emerald-700 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
              {lastImportFeedback}
            </p>
          )}
        </div>

        {!hasDraft ? (
          <EmptyState
            icon={Calendar}
            title="No draft calendar"
            description="Create a draft to start building the master calendar."
            action={
              <Button onClick={handleCreateDraft} disabled={isBusy}>
                <Plus className="mr-1 h-4 w-4" />
                Create Draft
              </Button>
            }
          />
        ) : (
          <>
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Physician Auto-Fill</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Fills schedule slots for the selected physician only. Re-running replaces that physician&apos;s
                    prior auto assignments and preserves manual assignments.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={handleAutoAssignSelectedPhysician}
                  disabled={isBusy || !selectedSchedulerPhysicianId}
                >
                  {isPhysicianAutoAssigning && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  <Wand2 className="mr-1 h-4 w-4" />
                  Auto-Fill Selected Physician
                </Button>
              </div>

              <label className="space-y-1 block">
                <span className="text-xs text-muted-foreground">Selected physician</span>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={selectedSchedulerPhysicianId}
                  onChange={(event) => {
                    const physicianId = event.target.value
                    setSelectedSchedulerPhysicianId(physicianId)
                    setHighlightPhysicianId(physicianId || null)
                  }}
                  disabled={isBusy || data.physicians.length === 0}
                >
                  {data.physicians.length === 0 && <option value="">No active physicians</option>}
                  {data.physicians.map((physician) => (
                    <option key={String(physician._id)} value={String(physician._id)}>
                      {physician.initials} - {physician.fullName}
                    </option>
                  ))}
                </select>
              </label>

              {lastPhysicianResult && (
                <div className="rounded-md border bg-muted/20 px-3 py-2 space-y-1.5">
                  <p className="text-xs font-medium">{lastPhysicianResult.message}</p>
                  <p className="text-xs text-muted-foreground">
                    Assigned {lastPhysicianResult.assignedCount} slot(s), {lastPhysicianResult.remainingUnstaffedCount} unfilled slot(s) remain.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    cFTE {lastPhysicianResult.physicianMetrics.totalCfte.toFixed(2)} / target{" "}
                    {lastPhysicianResult.physicianMetrics.targetCfte.toFixed(2)}{" "}
                    ({lastPhysicianResult.physicianMetrics.headroom >= 0 ? "+" : ""}
                    {lastPhysicianResult.physicianMetrics.headroom.toFixed(2)} headroom)
                  </p>
                  {lastPhysicianResult.warnings.length > 0 && (
                    <div className="space-y-1">
                      {lastPhysicianResult.warnings.map((warning) => (
                        <p
                          key={warning}
                          className="text-xs text-amber-800 rounded border border-amber-200 bg-amber-50 px-2 py-1"
                        >
                          {warning}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Selected Physician Draft Schedule</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Export or review one physician&apos;s schedule before full department publish.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleExportSelectedPhysicianCsv}
                    disabled={!selectedSchedulerPhysician || selectedPhysicianScheduleRows.length === 0}
                  >
                    <Download className="mr-1 h-4 w-4" />
                    Export Doctor CSV
                  </Button>
                  {exportCalendarData && selectedSchedulerPhysician ? (
                    <IcsExportButton
                      calendarData={exportCalendarData}
                      forPhysicianId={selectedSchedulerPhysician._id}
                      forPhysicianInitials={selectedSchedulerPhysician.initials}
                    />
                  ) : null}
                </div>
              </div>

              {selectedSchedulerPhysician ? (
                selectedPhysicianScheduleRows.length > 0 ? (
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr className="border-b">
                          <th className="px-2 py-2 text-left font-semibold">Week</th>
                          <th className="px-2 py-2 text-left font-semibold">Start</th>
                          <th className="px-2 py-2 text-left font-semibold">End</th>
                          <th className="px-2 py-2 text-left font-semibold">Rotation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedPhysicianScheduleRows.map((row) => (
                          <tr key={`${row.weekNumber}-${row.rotationAbbreviation}`} className="border-b last:border-b-0">
                            <td className="px-2 py-1.5">{row.weekNumber}</td>
                            <td className="px-2 py-1.5">{row.weekStart}</td>
                            <td className="px-2 py-1.5">{row.weekEnd}</td>
                            <td className="px-2 py-1.5">
                              {row.rotationName} ({row.rotationAbbreviation})
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No draft assignments yet for {selectedSchedulerPhysician.fullName}.
                  </p>
                )
              ) : (
                <p className="text-xs text-muted-foreground">Select a physician to review draft schedule output.</p>
              )}
            </div>

            {/* Admin progress + physician highlight controls */}
            <div className="rounded-lg border bg-card p-4 space-y-4">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <MetricCard label="Coverage" value={`${calendarProgress.completionPct}%`} />
                <MetricCard label="Assigned" value={String(calendarProgress.assignedSlots)} />
                <MetricCard label="Unassigned" value={String(calendarProgress.unassignedSlots)} />
                <MetricCard label="Weeks" value={String(calendarProgress.totalWeeks)} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Physician Workload Focus</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setHighlightPhysicianId(null)}
                    disabled={!highlightPhysicianId}
                  >
                    Clear highlight
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {calendarProgress.physicianRows.map((row) => {
                    const isSelected = highlightPhysicianId === row.physicianId
                    return (
                      <button
                        key={row.physicianId}
                        type="button"
                        onClick={() => {
                          setHighlightPhysicianId((current) =>
                            current === row.physicianId ? null : row.physicianId,
                          )
                          setSelectedSchedulerPhysicianId(row.physicianId)
                        }}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                          isSelected
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-background hover:bg-muted/50",
                        )}
                      >
                        <span className="font-semibold">{row.initials}</span>
                        <span className="text-muted-foreground">{row.assignedWeeks}w</span>
                      </button>
                    )
                  })}
                </div>

                {calendarProgress.selected && (
                  <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                    <p className="font-medium">{calendarProgress.selected.fullName}</p>
                    <p className="text-muted-foreground">
                      {calendarProgress.selected.assignedWeeks} assigned weeks,{" "}
                      {calendarProgress.selected.assignedCells} assignment slots,{" "}
                      {calendarProgress.selected.weekCoveragePct}% week coverage
                      {calendarProgress.selectedCfte && (
                        <>
                          {" · "}cFTE {calendarProgress.selectedCfte.totalCfte.toFixed(2)}
                          {calendarProgress.selectedCfte.targetCfte !== null &&
                            ` / ${calendarProgress.selectedCfte.targetCfte.toFixed(2)}`}
                        </>
                      )}
                    </p>
                    {calendarProgress.selectedCfte && (
                      <div className="mt-2 rounded-md border bg-background px-2.5 py-2 text-xs">
                        <p className="text-muted-foreground">
                          Rotation cFTE {calendarProgress.selectedCfte.rotationCfte.toFixed(2)} + Clinic cFTE{" "}
                          {calendarProgress.selectedCfte.clinicCfte.toFixed(2)} = Total{" "}
                          {calendarProgress.selectedCfte.totalCfte.toFixed(2)}
                          {calendarProgress.selectedCfte.targetCfte !== null &&
                            ` / Target ${calendarProgress.selectedCfte.targetCfte.toFixed(2)}`}
                        </p>
                        <p
                          className={cn(
                            "mt-1 font-semibold",
                            calendarProgress.selectedCfte.targetCfte === null
                              ? "text-muted-foreground"
                              : calendarProgress.selectedCfte.isOverTarget
                                ? "text-rose-600"
                                : "text-emerald-600",
                          )}
                        >
                          Target met:{" "}
                          {calendarProgress.selectedCfte.targetCfte === null
                            ? "No target set"
                            : calendarProgress.selectedCfte.isOverTarget
                              ? "No"
                              : "Yes"}
                        </p>
                      </div>
                    )}
                    <div className="mt-2 rounded-md border bg-background px-2.5 py-2">
                      <p className="text-xs font-semibold">Rotation Weeks by Service</p>
                      {calendarProgress.selectedServiceBreakdown.length > 0 ? (
                        <div className="mt-1 space-y-1">
                          {calendarProgress.selectedServiceBreakdown.map((row) => (
                            <div
                              key={row.service}
                              className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-xs"
                            >
                              <span className="font-medium">{row.service}</span>
                              <span className="text-muted-foreground">{row.weeks}w</span>
                              <span className="tabular-nums">{row.rotationCfte.toFixed(2)} cFTE</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">No rotation assignments yet.</p>
                      )}
                    </div>
                    <div className="mt-2 rounded-md border bg-background px-2.5 py-2">
                      <p className="text-xs font-semibold">Clinic cFTE (Annual)</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {calendarProgress.clinicHalfDaysAnnualTotal} half-days total ·{" "}
                        {calendarProgress.clinicCfteAnnualTotal.toFixed(2)} clinic cFTE
                      </p>
                      {calendarProgress.selectedClinicBreakdown.length > 0 ? (
                        <div className="mt-1 space-y-1">
                          {calendarProgress.selectedClinicBreakdown.map((row) => (
                            <div
                              key={row.clinicName}
                              className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-xs"
                            >
                              <span className="font-medium">{row.clinicName}</span>
                              <span className="text-muted-foreground">
                                {row.halfDaysPerWeek} hd/wk x {row.activeWeeks}w
                              </span>
                              <span className="tabular-nums">{row.annualClinicCfte.toFixed(2)} cFTE</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">No clinic assignments set.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Annual Workload Report</h3>
                  <p className="text-xs text-muted-foreground">
                    Weeks per service, annual rotation/clinic cFTE, and target attainment by physician.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleExportAnnualReport}
                    disabled={annualReportRows.length === 0}
                  >
                    <Download className="mr-1 h-4 w-4" />
                    Export CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handlePrintAnnualReport}
                    disabled={annualReportRows.length === 0}
                  >
                    <Printer className="mr-1 h-4 w-4" />
                    Print / PDF
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-md border">
                <table className="min-w-[1100px] w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr className="border-b">
                      <th className="px-2 py-2 text-left font-semibold">Physician</th>
                      <th className="px-2 py-2 text-left font-semibold">Init</th>
                      <th className="px-2 py-2 text-right font-semibold">Weeks</th>
                      <th className="px-2 py-2 text-right font-semibold">Slots</th>
                      <th className="px-2 py-2 text-right font-semibold">Coverage %</th>
                      {serviceColumns.map((service) => (
                        <th key={service} className="px-2 py-2 text-right font-semibold whitespace-nowrap">
                          {service} w
                        </th>
                      ))}
                      <th className="px-2 py-2 text-right font-semibold whitespace-nowrap">Rotation cFTE</th>
                      <th className="px-2 py-2 text-right font-semibold whitespace-nowrap">Clinic Half-Days</th>
                      <th className="px-2 py-2 text-right font-semibold whitespace-nowrap">Clinic cFTE</th>
                      <th className="px-2 py-2 text-right font-semibold whitespace-nowrap">Total cFTE</th>
                      <th className="px-2 py-2 text-right font-semibold whitespace-nowrap">Target</th>
                      <th className="px-2 py-2 text-right font-semibold whitespace-nowrap">Met</th>
                    </tr>
                  </thead>
                  <tbody>
                    {annualReportRows.map((row) => (
                      <tr key={row.physicianId} className="border-b last:border-b-0">
                        <td className="px-2 py-1.5 font-medium whitespace-nowrap">{row.physicianName}</td>
                        <td className="px-2 py-1.5">{row.initials}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{row.assignedWeeks}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{row.assignedSlots}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{row.coveragePct}</td>
                        {serviceColumns.map((service) => (
                          <td key={`${row.physicianId}-${service}`} className="px-2 py-1.5 text-right tabular-nums">
                            {row.serviceWeeks[service] ?? 0}
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-right tabular-nums">{row.rotationCfte.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{row.clinicHalfDaysAnnual}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{row.clinicCfte.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{row.totalCfte.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {row.targetCfte === null ? "N/A" : row.targetCfte.toFixed(2)}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-1.5 text-right font-semibold",
                            row.targetMet === null
                              ? "text-muted-foreground"
                              : row.targetMet
                                ? "text-emerald-600"
                                : "text-rose-600",
                          )}
                        >
                          {row.targetMet === null ? "N/A" : row.targetMet ? "Yes" : "No"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Use Print / PDF to save this table as a PDF from your browser dialog.
              </p>
            </div>

            {/* cFTE Summary */}
            {data.cfteSummary.length > 0 && (
              <div className="overflow-x-auto rounded-lg border">
                <div className="px-4 py-2 border-b bg-muted/50">
                  <h3 className="text-xs font-semibold text-muted-foreground">cFTE Summary</h3>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-px bg-border">
                  {data.cfteSummary.map((row) => (
                    <div
                      key={String(row.physicianId)}
                      className={cn(
                        "bg-background px-3 py-2",
                        row.isOverTarget && "bg-rose-50 dark:bg-rose-950/20",
                      )}
                    >
                      <p className="text-xs font-medium truncate">{row.initials}</p>
                      <p className="text-sm font-bold">
                        {row.totalCfte.toFixed(2)}
                        {row.targetCfte !== null && (
                          <span className="text-xs text-muted-foreground font-normal">
                            /{row.targetCfte.toFixed(2)}
                          </span>
                        )}
                      </p>
                      {row.headroom !== null && (
                        <p className={cn(
                          "text-[10px]",
                          row.headroom >= 0 ? "text-emerald-600" : "text-rose-600",
                        )}>
                          {row.headroom >= 0 ? "+" : ""}{row.headroom.toFixed(2)} room
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Assignment Grid */}
            <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
              <div className="min-w-[800px]">
                {/* Month label row */}
                <div
                  className="grid gap-px text-xs bg-muted/20"
                  style={{
                    gridTemplateColumns: `110px repeat(${data.grid.length}, minmax(60px, 1fr))`,
                  }}
                >
                  <div className="sticky left-0 z-10 bg-muted/20 px-2 py-1" />
                  {data.grid.map((row, i) => {
                    const isBreak = monthBreakSet.has(i)
                    const breakInfo = monthBreaks.find((b) => b.weekIndex === i)
                    return (
                      <div
                        key={`month-${i}`}
                        className={cn(
                          "px-1 py-1 text-[10px] font-semibold tracking-wide",
                          isBreak
                            ? "border-l-2 border-muted-foreground/25 text-muted-foreground"
                            : "text-transparent"
                        )}
                      >
                        {breakInfo?.label ?? "·"}
                      </div>
                    )
                  })}
                </div>

                {/* Week number row */}
                <div
                  className="grid gap-px text-xs border-b border-t bg-muted/40"
                  style={{
                    gridTemplateColumns: `110px repeat(${data.grid.length}, minmax(60px, 1fr))`,
                  }}
                >
                  <div className="px-3 py-1.5 font-medium text-muted-foreground sticky left-0 bg-muted/40 z-10 text-[10px] uppercase tracking-wider">
                    Rotation
                  </div>
                  {data.grid.map((row, i) => (
                    <div
                      key={row.weekNumber}
                      className={cn(
                        "px-1 py-1.5 text-center text-[10px] font-medium text-muted-foreground",
                        monthBreakSet.has(i) && "border-l-2 border-muted-foreground/25"
                      )}
                    >
                      {row.weekNumber}
                    </div>
                  ))}
                </div>

                {/* One row per rotation */}
                {data.rotations.map((rotation, rotIdx) => {
                  const accent = getRotationAccent(rotIdx)
                  return (
                    <div
                      key={String(rotation._id)}
                      className="grid gap-px border-b last:border-b-0"
                      style={{
                        gridTemplateColumns: `110px repeat(${data.grid.length}, minmax(60px, 1fr))`,
                      }}
                    >
                      {/* Rotation label with accent dot */}
                      <div className="px-3 py-1.5 text-xs font-semibold sticky left-0 bg-card z-10 flex items-center gap-1.5 border-r border-border/40">
                        <span className={cn("h-2 w-2 rounded-full shrink-0", accent.dot)} />
                        <span className="text-foreground truncate">{rotation.abbreviation}</span>
                      </div>

                      {/* Assignment cells */}
                      {data.grid.map((weekRow, colIdx) => {
                        const cell = weekRow.cells.find(
                          (c) => String(c.rotationId) === String(rotation._id),
                        )
                        const currentPhysicianId = cell?.physicianId ? String(cell.physicianId) : ""
                        const assignedPhysician = currentPhysicianId
                          ? data.physicians.find((p) => String(p._id) === currentPhysicianId)
                          : null

                        const cellKey = `${String(weekRow.weekId)}:${String(rotation._id)}`
                        const isCellPending = cellPending.has(cellKey)
                        const isSelected = !!highlightPhysicianId && currentPhysicianId === highlightPhysicianId
                        const isDimmed =
                          !!highlightPhysicianId &&
                          !!currentPhysicianId &&
                          currentPhysicianId !== highlightPhysicianId

                        return (
                          <div
                            key={weekRow.weekNumber}
                            className={cn(
                              "px-0.5 py-0.5",
                              monthBreakSet.has(colIdx) && "border-l-2 border-muted-foreground/25"
                            )}
                          >
                            {/* Styled cell display + invisible select overlay */}
                            <div className="relative">
                              {/* Visual display */}
                              <div
                                className={cn(
                                  "h-7 flex items-center px-1.5 rounded-sm text-[10px] font-medium transition-opacity",
                                  assignedPhysician
                                    ? cn(
                                        "border-l-[3px] bg-card text-foreground",
                                        accent.borderL
                                      )
                                    : "border border-dashed border-muted-foreground/30 bg-transparent text-muted-foreground/40",
                                  isSelected && "ring-1 ring-primary/60 bg-primary/10",
                                  isDimmed && "opacity-35",
                                  !isDraft && "opacity-50"
                                )}
                              >
                                {assignedPhysician?.initials ?? "—"}
                              </div>
                              {/* Invisible interactive select */}
                              <select
                                className="absolute inset-0 opacity-0 w-full cursor-pointer disabled:cursor-default"
                                value={currentPhysicianId}
                                onChange={(e) =>
                                  handleAssignCell(
                                    String(weekRow.weekId),
                                    String(rotation._id),
                                    e.target.value || null,
                                  )
                                }
                                disabled={!isDraft || isBusy || isCellPending}
                                aria-label={`${rotation.abbreviation} week ${weekRow.weekNumber}`}
                              >
                                <option value="">—</option>
                                {data.physicians.map((p) => {
                                  const avail = availabilityMap.get(`${String(p._id)}:${String(weekRow.weekId)}`)
                                  const prefix = avail === "red" ? "🔴 " : avail === "yellow" ? "🟡 " : ""
                                  return (
                                    <option key={String(p._id)} value={String(p._id)}>
                                      {prefix}{p.initials}
                                    </option>
                                  )
                                })}
                              </select>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Auto-Fill Settings Sheet */}
      {data.fiscalYear && (
        <AutoFillConfigPanel
          open={configOpen}
          onOpenChange={setConfigOpen}
          fiscalYearId={data.fiscalYear._id}
        />
      )}

      {/* Decision Log Sheet */}
      <AutoFillDecisionLog
        open={decisionLogOpen}
        onOpenChange={setDecisionLogOpen}
        calendarId={data.calendar?._id}
        weeks={data.weeks.map((w) => ({ _id: w._id, weekNumber: w.weekNumber }))}
        rotations={data.rotations.map((r) => ({ _id: r._id, name: r.name, abbreviation: r.abbreviation }))}
        physicians={data.physicians.map((p) => ({ _id: p._id, initials: p.initials, lastName: p.fullName.split(" ").pop() ?? "" }))}
      />
    </>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  )
}
