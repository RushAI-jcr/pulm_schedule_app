"use client"

import { useState, useMemo } from "react"
import { useQuery } from "convex/react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

interface DecisionLogEntry {
  _id: Id<"autoFillDecisionLog">
  weekId: Id<"weeks">
  rotationId: Id<"rotations">
  selectedPhysicianId: Id<"physicians">
  score: number
  scoreBreakdown: string
  alternativesConsidered: number
  passNumber: number
}

interface AutoFillDecisionLogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  calendarId: Id<"masterCalendars"> | undefined
  weeks: Array<{ _id: Id<"weeks">; weekNumber: number }>
  rotations: Array<{ _id: Id<"rotations">; name?: string; abbreviation?: string }>
  physicians: Array<{ _id: Id<"physicians">; initials: string; lastName: string }>
}

function parseBreakdown(json: string): Record<string, number> {
  try {
    return JSON.parse(json)
  } catch {
    return {}
  }
}

export function AutoFillDecisionLog({
  open,
  onOpenChange,
  calendarId,
  weeks,
  rotations,
  physicians,
}: AutoFillDecisionLogProps) {
  const logEntries = useQuery(
    api.functions.masterCalendar.getAutoFillDecisionLog,
    calendarId ? { masterCalendarId: calendarId } : "skip",
  )

  const [filterPhysician, setFilterPhysician] = useState<string>("all")
  const [filterRotation, setFilterRotation] = useState<string>("all")
  const [filterPass, setFilterPass] = useState<string>("all")
  const [sortField, setSortField] = useState<"week" | "score">("week")
  const [sortAsc, setSortAsc] = useState(true)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  // Build lookup maps
  const weekMap = useMemo(() => new Map(weeks.map((w) => [String(w._id), w])), [weeks])
  const rotationMap = useMemo(() => new Map(rotations.map((r) => [String(r._id), r])), [rotations])
  const physicianMap = useMemo(() => new Map(physicians.map((p) => [String(p._id), p])), [physicians])

  // Filter + sort
  const filtered = useMemo(() => {
    if (!logEntries) return []

    let entries = [...logEntries] as DecisionLogEntry[]

    if (filterPhysician !== "all") {
      entries = entries.filter((e) => String(e.selectedPhysicianId) === filterPhysician)
    }
    if (filterRotation !== "all") {
      entries = entries.filter((e) => String(e.rotationId) === filterRotation)
    }
    if (filterPass !== "all") {
      entries = entries.filter((e) => e.passNumber === parseInt(filterPass, 10))
    }

    entries.sort((a, b) => {
      if (sortField === "week") {
        const wA = weekMap.get(String(a.weekId))?.weekNumber ?? 0
        const wB = weekMap.get(String(b.weekId))?.weekNumber ?? 0
        return sortAsc ? wA - wB : wB - wA
      }
      return sortAsc ? a.score - b.score : b.score - a.score
    })

    return entries
  }, [logEntries, filterPhysician, filterRotation, filterPass, sortField, sortAsc, weekMap])

  const handleSort = (field: "week" | "score") => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(field === "week")
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Decision Log</SheetTitle>
          <SheetDescription>
            See why each physician was selected for each cell.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Physician</Label>
              <Select value={filterPhysician} onValueChange={setFilterPhysician}>
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {physicians.map((p) => (
                    <SelectItem key={String(p._id)} value={String(p._id)}>
                      {p.initials}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Rotation</Label>
              <Select value={filterRotation} onValueChange={setFilterRotation}>
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {rotations.map((r) => (
                    <SelectItem key={String(r._id)} value={String(r._id)}>
                      {r.abbreviation ?? r.name ?? String(r._id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Pass</Label>
              <Select value={filterPass} onValueChange={setFilterPass}>
                <SelectTrigger className="w-20 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Table */}
          {logEntries === undefined ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground">No decision log entries found.</p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead
                      className="text-xs cursor-pointer select-none"
                      onClick={() => handleSort("week")}
                    >
                      Week {sortField === "week" && (sortAsc ? "\u2191" : "\u2193")}
                    </TableHead>
                    <TableHead className="text-xs">Rotation</TableHead>
                    <TableHead className="text-xs">Physician</TableHead>
                    <TableHead
                      className="text-xs cursor-pointer select-none"
                      onClick={() => handleSort("score")}
                    >
                      Score {sortField === "score" && (sortAsc ? "\u2191" : "\u2193")}
                    </TableHead>
                    <TableHead className="text-xs">Pass</TableHead>
                    <TableHead className="text-xs">Alts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((entry) => {
                    const entryId = String(entry._id)
                    const isExpanded = expandedRow === entryId
                    const week = weekMap.get(String(entry.weekId))
                    const rotation = rotationMap.get(String(entry.rotationId))
                    const physician = physicianMap.get(String(entry.selectedPhysicianId))
                    const breakdown = parseBreakdown(entry.scoreBreakdown)

                    return (
                      <>
                        <TableRow
                          key={entryId}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setExpandedRow(isExpanded ? null : entryId)}
                        >
                          <TableCell className="p-1 w-8">
                            {isExpanded ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ChevronRight className="h-3 w-3" />
                            )}
                          </TableCell>
                          <TableCell className="text-xs py-1.5">
                            W{week?.weekNumber ?? "?"}
                          </TableCell>
                          <TableCell className="text-xs py-1.5">
                            {rotation?.abbreviation ?? rotation?.name ?? "?"}
                          </TableCell>
                          <TableCell className="text-xs py-1.5 font-medium">
                            {physician?.initials ?? "?"}
                          </TableCell>
                          <TableCell className={cn(
                            "text-xs py-1.5 font-mono",
                            entry.score >= 60 ? "text-emerald-600" :
                            entry.score >= 40 ? "text-amber-600" : "text-rose-600",
                          )}>
                            {entry.score.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-xs py-1.5">{entry.passNumber}</TableCell>
                          <TableCell className="text-xs py-1.5">{entry.alternativesConsidered}</TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${entryId}-detail`}>
                            <TableCell colSpan={7} className="bg-muted/30 px-4 py-2">
                              <p className="text-xs font-semibold mb-1">Score Breakdown</p>
                              <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                                {Object.entries(breakdown).map(([key, val]) => (
                                  <div key={key} className="flex justify-between text-xs">
                                    <span className="text-muted-foreground capitalize">
                                      {key.replace(/([A-Z])/g, " $1").trim()}
                                    </span>
                                    <span className="font-mono">{(val as number).toFixed(1)}</span>
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground">
            Showing {filtered.length} of {logEntries?.length ?? 0} entries
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
