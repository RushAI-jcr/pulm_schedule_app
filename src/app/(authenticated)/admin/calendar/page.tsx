"use client"

import { useState, useMemo } from "react"
import { useQuery, useMutation } from "convex/react"
import {
  Calendar,
  Plus,
  Wand2,
  Upload,
  Check,
  AlertTriangle,
  Loader2,
} from "lucide-react"
import { api } from "../../../../../convex/_generated/api"
import type { Id } from "../../../../../convex/_generated/dataModel"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { PageSkeleton } from "@/components/shared/loading-skeleton"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

export default function MasterCalendarPage() {
  const data = useQuery(api.functions.masterCalendar.getCurrentFiscalYearMasterCalendarDraft)
  const createDraft = useMutation(api.functions.masterCalendar.createCurrentFiscalYearMasterCalendarDraft)
  const assignCell = useMutation(api.functions.masterCalendar.assignCurrentFiscalYearDraftCell)
  const autoAssign = useMutation(api.functions.masterCalendar.autoAssignCurrentFiscalYearDraft)
  const publishDraft = useMutation(api.functions.masterCalendar.publishCurrentFiscalYearMasterCalendarDraft)

  const [isCreating, setIsCreating] = useState(false)
  const [isAutoAssigning, setIsAutoAssigning] = useState(false)
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    setIsCreating(true)
    setError(null)
    try {
      await createDraft({})
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create draft")
    } finally {
      setIsCreating(false)
    }
  }

  const handleAutoAssign = async () => {
    setIsAutoAssigning(true)
    setError(null)
    try {
      await autoAssign({})
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-assign failed")
    } finally {
      setIsAutoAssigning(false)
    }
  }

  const handlePublish = async () => {
    setIsPublishing(true)
    setError(null)
    try {
      await publishDraft({})
      setPublishDialogOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed")
    } finally {
      setIsPublishing(false)
    }
  }

  const handleAssignCell = async (weekId: string, rotationId: string, physicianId: string | null) => {
    try {
      await assignCell({
        weekId: weekId as Id<"weeks">,
        rotationId: rotationId as Id<"rotations">,
        physicianId: physicianId ? (physicianId as Id<"physicians">) : undefined,
      })
    } catch {
      // Error will show in Convex
    }
  }

  // Build availability lookup
  const availabilityMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const entry of data.availabilityEntries) {
      map.set(`${String(entry.physicianId)}:${String(entry.weekId)}`, entry.availability)
    }
    return map
  }, [data.availabilityEntries])

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
              <Button size="sm" onClick={handleCreateDraft} disabled={isCreating}>
                {isCreating && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                <Plus className="mr-1 h-4 w-4" />
                Create Draft
              </Button>
            )}
            {hasDraft && isDraft && (
              <>
                <Button size="sm" variant="outline" onClick={handleAutoAssign} disabled={isAutoAssigning}>
                  {isAutoAssigning && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  <Wand2 className="mr-1 h-4 w-4" />
                  Auto-Assign
                </Button>
                <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
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
                      <Button onClick={handlePublish} disabled={isPublishing}>
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

        {!hasDraft ? (
          <EmptyState
            icon={Calendar}
            title="No draft calendar"
            description="Create a draft to start building the master calendar."
            action={
              <Button onClick={handleCreateDraft} disabled={isCreating}>
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
            <div className="overflow-x-auto rounded-lg border">
              <div className="min-w-[800px]">
                {/* Header row: week numbers */}
                <div
                  className="grid gap-px text-xs border-b bg-muted/50"
                  style={{
                    gridTemplateColumns: `100px repeat(${data.grid.length}, minmax(60px, 1fr))`,
                  }}
                >
                  <div className="px-2 py-2 font-medium text-muted-foreground sticky left-0 bg-muted/50 z-10">
                    Rotation
                  </div>
                  {data.grid.map((row) => (
                    <div key={row.weekNumber} className="px-1 py-2 text-center font-medium text-muted-foreground">
                      W{row.weekNumber}
                    </div>
                  ))}
                </div>

                {/* One row per rotation */}
                {data.rotations.map((rotation) => (
                  <div
                    key={String(rotation._id)}
                    className="grid gap-px border-b last:border-b-0"
                    style={{
                      gridTemplateColumns: `100px repeat(${data.grid.length}, minmax(60px, 1fr))`,
                    }}
                  >
                    <div className="px-2 py-1.5 text-xs font-semibold sticky left-0 bg-background z-10 flex items-center">
                      {rotation.abbreviation}
                    </div>
                    {data.grid.map((weekRow) => {
                      const cell = weekRow.cells.find(
                        (c) => String(c.rotationId) === String(rotation._id),
                      )
                      const currentPhysicianId = cell?.physicianId ? String(cell.physicianId) : ""

                      return (
                        <div key={weekRow.weekNumber} className="px-0.5 py-0.5">
                          <select
                            className={cn(
                              "w-full h-7 text-[10px] rounded border-0 bg-muted/30 text-center cursor-pointer",
                              "hover:bg-accent focus:ring-1 focus:ring-primary",
                              currentPhysicianId && "bg-primary/10 font-medium",
                              !isDraft && "pointer-events-none opacity-60",
                            )}
                            value={currentPhysicianId}
                            onChange={(e) =>
                              handleAssignCell(
                                String(weekRow.weekId),
                                String(rotation._id),
                                e.target.value || null,
                              )
                            }
                            disabled={!isDraft}
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
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
