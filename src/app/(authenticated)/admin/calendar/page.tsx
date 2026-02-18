"use client"

import { useState, useMemo, useRef } from "react"
import { useQuery, useMutation } from "convex/react"
import {
  Calendar,
  Plus,
  Wand2,
  Upload,
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

type OpState = "idle" | "creating" | "auto_assigning" | "clearing" | "publishing"

export default function MasterCalendarPage() {
  const data = useQuery(api.functions.masterCalendar.getCurrentFiscalYearMasterCalendarDraft)
  const createDraft = useMutation(api.functions.masterCalendar.createCurrentFiscalYearMasterCalendarDraft)
  const assignCell = useMutation(api.functions.masterCalendar.assignCurrentFiscalYearDraftCell)
  const autoAssign = useMutation(api.functions.masterCalendar.autoAssignCurrentFiscalYearDraft)
  const clearAutoFilled = useMutation(api.functions.masterCalendar.clearAutoFilledAssignments)
  const publishDraft = useMutation(api.functions.masterCalendar.publishCurrentFiscalYearMasterCalendarDraft)

  const [opState, setOpState] = useState<OpState>("idle")
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [decisionLogOpen, setDecisionLogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastMetrics, setLastMetrics] = useState<AutoFillMetrics | null>(null)
  const [cellPending, setCellPending] = useState<Set<string>>(new Set())
  const cellPendingRef = useRef(new Set<string>())

  const isCreating = opState === "creating"
  const isAutoAssigning = opState === "auto_assigning"
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
    try {
      const result = await autoAssign({})
      setLastMetrics(result.metrics)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-assign failed")
    } finally {
      setOpState("idle")
    }
  }

  const handleClearAutoFilled = async () => {
    if (opState !== "idle") return
    setOpState("clearing")
    setError(null)
    try {
      await clearAutoFilled({})
      setLastMetrics(null)
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

  const hasDraft = !!data.calendar
  const isDraft = data.calendar?.status === "draft"

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
