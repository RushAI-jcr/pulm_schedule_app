"use client"

import { useState, useMemo, useEffect } from "react"
import { useQuery, useMutation, useAction } from "convex/react"
import {
  ChevronRight,
  Plus,
  Loader2,
  Check,
  X,
  Calendar,
  Users,
  Globe,
  BookOpen,
  AlertTriangle,
  Eye,
  EyeOff,
  Database,
} from "lucide-react"
import { api } from "../../../../../convex/_generated/api"
import type { Id } from "../../../../../convex/_generated/dataModel"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { PageSkeleton } from "@/components/shared/loading-skeleton"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

const NEXT_STATUS: Record<string, string | undefined> = {
  setup: "collecting",
  collecting: "building",
  building: "published",
  published: "archived",
  archived: undefined,
}

const CONFERENCE_NAMES = ["CHEST", "SCCM", "ATS"] as const

function FiscalYearSection() {
  const currentFY = useQuery(api.functions.fiscalYears.getCurrentFiscalYear)
  const updateStatus = useMutation(api.functions.fiscalYears.updateFiscalYearStatus)
  const setDeadline = useMutation(api.functions.fiscalYears.setFiscalYearRequestDeadline)
  const createFY = useMutation(api.functions.fiscalYears.createFiscalYear)

  const [targetStatus, setTargetStatus] = useState("")
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [statusResult, setStatusResult] = useState<string | null>(null)

  const [deadlineValue, setDeadlineValue] = useState("")
  const [isSavingDeadline, setIsSavingDeadline] = useState(false)

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newLabel, setNewLabel] = useState("")
  const [newStartDate, setNewStartDate] = useState("")
  const [newEndDate, setNewEndDate] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    if (currentFY) {
      setTargetStatus(NEXT_STATUS[currentFY.status] ?? currentFY.status)
      setDeadlineValue(currentFY.requestDeadline ?? "")
    } else {
      setTargetStatus("")
      setDeadlineValue("")
    }
  }, [currentFY?._id, currentFY?.status, currentFY?.requestDeadline])

  if (currentFY === undefined) return <PageSkeleton />

  const handleUpdateStatus = async () => {
    if (!currentFY || !targetStatus || targetStatus === currentFY.status) return
    setIsUpdatingStatus(true)
    setStatusResult(null)
    try {
      const result = await updateStatus({
        fiscalYearId: currentFY._id,
        status: targetStatus as "setup" | "collecting" | "building" | "published" | "archived",
      })
      setStatusResult(result.message)
    } catch (err) {
      setStatusResult(`Error: ${err instanceof Error ? err.message : "Failed to update status"}`)
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const handleSaveDeadline = async () => {
    if (!currentFY) return
    setIsSavingDeadline(true)
    try {
      await setDeadline({
        fiscalYearId: currentFY._id,
        requestDeadline: deadlineValue || undefined,
      })
    } catch {
      // Error handled by Convex
    } finally {
      setIsSavingDeadline(false)
    }
  }

  const handleCreateFY = async () => {
    setIsCreating(true)
    setCreateError(null)
    try {
      await createFY({ label: newLabel, startDate: newStartDate, endDate: newEndDate })
      setCreateDialogOpen(false)
      setNewLabel("")
      setNewStartDate("")
      setNewEndDate("")
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create fiscal year")
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="space-y-4">
      {!currentFY ? (
        <div className="rounded-lg border p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">No active fiscal year found.</p>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1 h-4 w-4" />
                Create Fiscal Year
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Fiscal Year</DialogTitle>
                <DialogDescription>
                  Create a new fiscal year with 52 weeks. Only one active FY can exist at a time.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 py-4">
                <div>
                  <Label className="text-xs">Label</Label>
                  <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="FY28" disabled={isCreating} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Start Date</Label>
                    <Input type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} disabled={isCreating} />
                  </div>
                  <div>
                    <Label className="text-xs">End Date</Label>
                    <Input type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} disabled={isCreating} />
                  </div>
                </div>
                {createError && <p className="text-xs text-destructive">{createError}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateFY} disabled={isCreating || !newLabel || !newStartDate || !newEndDate}>
                  {isCreating && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : (
        <>
          {/* Status Management */}
          <div className="rounded-lg border p-4 space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Fiscal Year Status
            </h4>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Current:</span>
              <span className="text-sm font-medium">{currentFY.label}</span>
              <StatusBadge status={currentFY.status} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={targetStatus} onValueChange={setTargetStatus} disabled={isUpdatingStatus}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={currentFY.status}>{currentFY.status}</SelectItem>
                  {NEXT_STATUS[currentFY.status] && (
                    <SelectItem value={NEXT_STATUS[currentFY.status]!}>
                      {NEXT_STATUS[currentFY.status]}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={handleUpdateStatus}
                disabled={!targetStatus || targetStatus === currentFY.status || isUpdatingStatus}
              >
                {isUpdatingStatus && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Update Status
              </Button>
            </div>
            {statusResult && (
              <p className={cn("text-xs", statusResult.startsWith("Error") ? "text-destructive" : "text-muted-foreground")}>
                {statusResult}
              </p>
            )}
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span>setup</span>
              {["collecting", "building", "published", "archived"].map((s) => (
                <span key={s} className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3" />
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Request Deadline */}
          <div className="rounded-lg border p-4 space-y-3">
            <h4 className="text-sm font-semibold">Request Deadline</h4>
            <p className="text-xs text-muted-foreground">
              Set the deadline for physicians to submit their schedule requests.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="date"
                value={deadlineValue}
                onChange={(e) => setDeadlineValue(e.target.value)}
                className="w-48"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveDeadline}
                disabled={isSavingDeadline}
              >
                {isSavingDeadline && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Save Deadline
              </Button>
              {deadlineValue && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDeadlineValue("")
                    if (currentFY) {
                      setDeadline({ fiscalYearId: currentFY._id, requestDeadline: undefined })
                    }
                  }}
                >
                  <X className="mr-1 h-3 w-3" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function CalendarEventsSection() {
  const currentFY = useQuery(api.functions.fiscalYears.getCurrentFiscalYear)
  const importHolidays = useAction(api.functions.calendarEvents.importCurrentFiscalYearUsPublicHolidays)
  const importReligious = useAction(api.functions.calendarEvents.importCurrentFiscalYearReligiousObservances)
  const updateEvent = useMutation(api.functions.calendarEvents.updateCalendarEvent)
  const conferenceBundle = useQuery(
    api.functions.calendarEvents.getCurrentFiscalYearInstitutionalConferences,
    currentFY ? {} : "skip",
  )
  const calendarEventsBundle = useQuery(
    api.functions.calendarEvents.getCurrentFiscalYearCalendarEvents,
    currentFY ? {} : "skip",
  )
  const weeksBundle = useQuery(
    api.functions.fiscalYears.getWeeks,
    currentFY ? { fiscalYearId: currentFY._id } : "skip",
  )
  const setConferenceDate = useMutation(
    api.functions.calendarEvents.setCurrentFiscalYearInstitutionalConferenceDate,
  )

  const [isImportingHolidays, setIsImportingHolidays] = useState(false)
  const [holidayResult, setHolidayResult] = useState<string | null>(null)
  const [isImportingReligious, setIsImportingReligious] = useState(false)
  const [religiousResult, setReligiousResult] = useState<string | null>(null)
  const [savingEventId, setSavingEventId] = useState<string | null>(null)
  const [conferenceDrafts, setConferenceDrafts] = useState<Record<string, string>>({})
  const [savingConference, setSavingConference] = useState<string | null>(null)

  const weekNumberById = useMemo(() => {
    const map = new Map<string, number>()
    if (!Array.isArray(weeksBundle)) return map
    for (const week of weeksBundle) {
      map.set(String(week._id), week.weekNumber)
    }
    return map
  }, [weeksBundle])

  useEffect(() => {
    if (!conferenceBundle?.conferences) return
    const drafts: Record<string, string> = {}
    for (const name of CONFERENCE_NAMES) {
      const row = conferenceBundle.conferences.find((c: { name: string }) => c.name === name)
      drafts[name] = row?.date ?? ""
    }
    setConferenceDrafts(drafts)
  }, [conferenceBundle?.fiscalYear?._id, conferenceBundle?.conferences])

  const pendingReligious = useMemo(() => {
    const events = calendarEventsBundle?.events ?? []
    return events
      .filter((e: { category: string }) => e.category === "religious_observance")
      .filter((e: { source: string }) => e.source === "calendarific")
      .filter((e: { isApproved: boolean }) => !e.isApproved)
      .sort((a: { date: string; name: string }, b: { date: string; name: string }) => {
        const byDate = a.date.localeCompare(b.date)
        return byDate !== 0 ? byDate : a.name.localeCompare(b.name)
      })
  }, [calendarEventsBundle?.events])

  if (currentFY === undefined) return <PageSkeleton />
  if (!currentFY) {
    return (
      <EmptyState
        icon={Calendar}
        title="No active fiscal year"
        description="Create a fiscal year in the Fiscal Year tab first."
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* US Public Holidays */}
      <div className="rounded-lg border p-4 space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Globe className="h-4 w-4" />
          US Public Holidays (Nager.Date)
        </h4>
        <p className="text-xs text-muted-foreground">
          Pull US public holidays and map each event to fiscal-year weeks.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={async () => {
              setIsImportingHolidays(true)
              try {
                const result = await importHolidays({})
                setHolidayResult(
                  `${result.message}. ${result.mappedHolidayCount} matched, ${result.updatedCount} updated, ${result.skippedExistingCount} skipped.`,
                )
              } catch (err) {
                setHolidayResult(`Error: ${err instanceof Error ? err.message : "Import failed"}`)
              } finally {
                setIsImportingHolidays(false)
              }
            }}
            disabled={isImportingHolidays}
          >
            {isImportingHolidays && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Import US Holidays
          </Button>
        </div>
        {holidayResult && (
          <p className={cn("text-xs", holidayResult.startsWith("Error") ? "text-destructive" : "text-muted-foreground")}>
            {holidayResult}
          </p>
        )}
      </div>

      {/* Religious Observances */}
      <div className="rounded-lg border p-4 space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          Religious Observances (Calendarific)
        </h4>
        <p className="text-xs text-muted-foreground">
          Pull US religious observances. Requires CALENDARIFIC_API_KEY in Convex environment.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={async () => {
              setIsImportingReligious(true)
              try {
                const result = await importReligious({})
                setReligiousResult(
                  `${result.message}. ${result.mappedHolidayCount} matched, ${result.updatedCount} updated, ${result.skippedExistingCount} skipped.`,
                )
              } catch (err) {
                setReligiousResult(`Error: ${err instanceof Error ? err.message : "Import failed"}`)
              } finally {
                setIsImportingReligious(false)
              }
            }}
            disabled={isImportingReligious}
          >
            {isImportingReligious && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Import Religious Observances
          </Button>
        </div>
        {religiousResult && (
          <p className={cn("text-xs", religiousResult.startsWith("Error") ? "text-destructive" : "text-muted-foreground")}>
            {religiousResult}
          </p>
        )}
      </div>

      {/* Approve Religious Observances */}
      <div className="rounded-lg border p-4 space-y-3">
        <h4 className="text-sm font-semibold">Approve Religious Observances</h4>
        <p className="text-xs text-muted-foreground">
          Review imported observances before they become visible to physicians.
        </p>
        {calendarEventsBundle === undefined ? (
          <p className="text-xs text-muted-foreground">Loading...</p>
        ) : pendingReligious.length === 0 ? (
          <p className="text-xs text-muted-foreground">No pending religious observances.</p>
        ) : (
          <div className="rounded-lg border overflow-auto max-h-72">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Week</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingReligious.map((event: any) => {
                  const weekNum = event.weekId ? weekNumberById.get(String(event.weekId)) : null
                  return (
                    <tr key={String(event._id)} className="border-b last:border-b-0">
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{event.date}</td>
                      <td className="px-3 py-2 text-xs">{event.name}</td>
                      <td className="px-3 py-2 text-xs">{weekNum ? `W${weekNum}` : "\u2014"}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs"
                            onClick={async () => {
                              setSavingEventId(String(event._id))
                              try {
                                await updateEvent({ eventId: event._id, isApproved: true, isVisible: true })
                              } catch {
                                // Handled by Convex
                              } finally {
                                setSavingEventId(null)
                              }
                            }}
                            disabled={savingEventId !== null}
                          >
                            <Eye className="mr-1 h-3 w-3" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs"
                            onClick={async () => {
                              setSavingEventId(String(event._id))
                              try {
                                await updateEvent({ eventId: event._id, isApproved: true, isVisible: false })
                              } catch {
                                // Handled by Convex
                              } finally {
                                setSavingEventId(null)
                              }
                            }}
                            disabled={savingEventId !== null}
                          >
                            <EyeOff className="mr-1 h-3 w-3" />
                            Hide
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Institutional Conferences */}
      <div className="rounded-lg border p-4 space-y-3">
        <h4 className="text-sm font-semibold">Institutional Conferences (CHEST, SCCM, ATS)</h4>
        <p className="text-xs text-muted-foreground">
          Set or update conference dates for the current fiscal year.
        </p>
        {conferenceBundle === undefined ? (
          <p className="text-xs text-muted-foreground">Loading...</p>
        ) : !conferenceBundle?.fiscalYear ? (
          <p className="text-xs text-muted-foreground">No active fiscal year found.</p>
        ) : (
          <div className="space-y-2">
            {CONFERENCE_NAMES.map((name) => (
              <div key={name} className="flex items-center gap-2 flex-wrap">
                <Label className="text-sm font-medium w-16">{name}</Label>
                <Input
                  type="date"
                  value={conferenceDrafts[name] ?? ""}
                  onChange={(e) =>
                    setConferenceDrafts((prev) => ({ ...prev, [name]: e.target.value }))
                  }
                  className="w-48"
                  disabled={savingConference === name}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const date = (conferenceDrafts[name] ?? "").trim()
                    if (!date) return
                    setSavingConference(name)
                    try {
                      await setConferenceDate({ conferenceName: name, date })
                    } catch {
                      // Handled by Convex
                    } finally {
                      setSavingConference(null)
                    }
                  }}
                  disabled={savingConference !== null || !(conferenceDrafts[name] ?? "").trim()}
                >
                  {savingConference === name && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Save
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PhysicianRosterSection() {
  const physicians = useQuery(api.functions.physicians.getPhysicians)
  const createPhysician = useMutation(api.functions.physicians.createPhysician)
  const updatePhysician = useMutation(api.functions.physicians.updatePhysician)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [initials, setInitials] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"physician" | "admin">("physician")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  if (physicians === undefined) return <PageSkeleton />

  const activeCount = physicians.filter((p) => p.isActive).length

  const handleCreate = async () => {
    setIsSaving(true)
    setError(null)
    try {
      await createPhysician({ firstName, lastName, initials, email, role })
      setDialogOpen(false)
      setFirstName("")
      setLastName("")
      setInitials("")
      setEmail("")
      setRole("physician")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create physician")
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleActive = async (physicianId: string, isActive: boolean) => {
    setTogglingId(physicianId)
    try {
      await updatePhysician({ physicianId: physicianId as Id<"physicians">, isActive })
    } catch {
      // Handled by Convex
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {activeCount} active / {physicians.length} total physicians
        </p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              Add Physician
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Physician</DialogTitle>
              <DialogDescription>Add a new physician to the roster.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">First Name</Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={isSaving} />
                </div>
                <div>
                  <Label className="text-xs">Last Name</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={isSaving} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Initials</Label>
                  <Input value={initials} onChange={(e) => setInitials(e.target.value)} placeholder="ABC" disabled={isSaving} />
                </div>
                <div>
                  <Label className="text-xs">Role</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as "physician" | "admin")} disabled={isSaving}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="physician">Physician</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isSaving} />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={isSaving || !firstName || !lastName || !initials || !email}>
                {isSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border">
        <div className="grid grid-cols-[1fr_80px_1fr_80px_80px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground hidden md:grid">
          <span>Name</span>
          <span className="text-center">Initials</span>
          <span>Email</span>
          <span className="text-center">Role</span>
          <span className="text-center">Status</span>
        </div>
        {physicians.map((p) => (
          <div
            key={String(p._id)}
            className={cn(
              "grid grid-cols-1 md:grid-cols-[1fr_80px_1fr_80px_80px] gap-2 items-center px-4 py-2.5 border-b last:border-b-0",
              !p.isActive && "opacity-50",
            )}
          >
            <span className="text-sm font-medium">{p.lastName}, {p.firstName}</span>
            <span className="hidden md:block text-center text-sm">{p.initials}</span>
            <span className="text-xs text-muted-foreground truncate">{p.email}</span>
            <div className="hidden md:flex justify-center">
              <Badge variant={p.role === "admin" ? "default" : "outline"} className="text-[10px]">
                {p.role}
              </Badge>
            </div>
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-7 text-xs", p.isActive ? "text-emerald-700" : "text-muted-foreground")}
                onClick={() => handleToggleActive(String(p._id), !p.isActive)}
                disabled={togglingId !== null}
              >
                {p.isActive ? (
                  <><Check className="mr-1 h-3 w-3" />Active</>
                ) : (
                  <><X className="mr-1 h-3 w-3" />Inactive</>
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SeedDataSection() {
  const seedPhysicians = useMutation(api.functions.physicians.seedPhysicians)
  const seedFY27 = useMutation(api.functions.fiscalYears.seedFY27)

  const [seedingPhysicians, setSeedingPhysicians] = useState(false)
  const [physicianResult, setPhysicianResult] = useState<string | null>(null)
  const [seedingFY, setSeedingFY] = useState(false)
  const [fyResult, setFyResult] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/20">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <span className="text-xs text-amber-800 dark:text-amber-300">
          Seed operations are intended for initial setup and development. Use with caution in production.
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">Seed Physicians</h4>
          </div>
          <p className="text-xs text-muted-foreground">Add 25 physicians to the database.</p>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={async () => {
              setSeedingPhysicians(true)
              try {
                const result = await seedPhysicians({})
                setPhysicianResult(result && typeof result === "object" && "message" in result ? String(result.message) : "Done")
              } catch (err) {
                setPhysicianResult(`Error: ${err instanceof Error ? err.message : "Failed"}`)
              } finally {
                setSeedingPhysicians(false)
              }
            }}
            disabled={seedingPhysicians}
          >
            {seedingPhysicians && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Seed Physicians
          </Button>
          {physicianResult && (
            <p className={cn("text-xs", physicianResult.startsWith("Error") ? "text-destructive" : "text-muted-foreground")}>
              {physicianResult}
            </p>
          )}
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">Create FY27</h4>
          </div>
          <p className="text-xs text-muted-foreground">Create FY27 with 52 weeks.</p>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={async () => {
              setSeedingFY(true)
              try {
                const result = await seedFY27({})
                setFyResult(result.message)
              } catch (err) {
                setFyResult(`Error: ${err instanceof Error ? err.message : "Failed"}`)
              } finally {
                setSeedingFY(false)
              }
            }}
            disabled={seedingFY}
          >
            {seedingFY && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Create FY27
          </Button>
          {fyResult && (
            <p className={cn("text-xs", fyResult.startsWith("Error") ? "text-destructive" : "text-muted-foreground")}>
              {fyResult}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Fiscal year lifecycle, calendar events, and roster management" />
      <div className="flex-1 p-4 md:p-6">
        <Tabs defaultValue="fiscal-year">
          <TabsList>
            <TabsTrigger value="fiscal-year">Fiscal Year</TabsTrigger>
            <TabsTrigger value="calendar-events">Calendar Events</TabsTrigger>
            <TabsTrigger value="roster">Physician Roster</TabsTrigger>
            <TabsTrigger value="seed-data">Seed Data</TabsTrigger>
          </TabsList>
          <TabsContent value="fiscal-year" className="mt-4">
            <FiscalYearSection />
          </TabsContent>
          <TabsContent value="calendar-events" className="mt-4">
            <CalendarEventsSection />
          </TabsContent>
          <TabsContent value="roster" className="mt-4">
            <PhysicianRosterSection />
          </TabsContent>
          <TabsContent value="seed-data" className="mt-4">
            <SeedDataSection />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
