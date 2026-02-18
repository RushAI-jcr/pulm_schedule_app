"use client"

import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Rotation = {
  _id: string
  name: string
  abbreviation: string
}

type PhysicianOption = {
  id: string
  name: string
}

type FiscalMonth = {
  month: number
  year: number
  label: string
}

interface CalendarFiltersProps {
  rotations: Rotation[]
  physicianOptions: PhysicianOption[]
  fiscalMonths: FiscalMonth[]
  scopeMode: "my" | "department"
  selectedRotationId: string | null
  selectedPhysicianId: string | null
  activeMonth: number | null
  viewMode: "year" | "month"
  onRotationChange: (id: string | null) => void
  onPhysicianChange: (id: string | null) => void
  onMonthSelect: (month: number, year: number) => void
  onClearMonth: () => void
  className?: string
}

export function CalendarFilters({
  rotations,
  physicianOptions,
  fiscalMonths,
  scopeMode,
  selectedRotationId,
  selectedPhysicianId,
  activeMonth,
  viewMode,
  onRotationChange,
  onPhysicianChange,
  onMonthSelect,
  onClearMonth,
  className,
}: CalendarFiltersProps) {
  const activeMonthKey =
    activeMonth !== null && viewMode === "month"
      ? fiscalMonths.find((m) => m.month === activeMonth)
          ? `${fiscalMonths.find((m) => m.month === activeMonth)!.year}-${activeMonth}`
          : undefined
      : undefined

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {/* Rotation filter */}
      {rotations.length > 0 && (
        <Select
          value={selectedRotationId ?? "all"}
          onValueChange={(v) => onRotationChange(v === "all" ? null : v)}
        >
          <SelectTrigger className="h-8 w-[155px] text-xs">
            <SelectValue placeholder="All rotations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All rotations</SelectItem>
            {rotations.map((r) => (
              <SelectItem key={r._id} value={r._id}>
                {r.abbreviation} — {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Physician filter — hidden in "My Calendar" scope */}
      {scopeMode === "department" && physicianOptions.length > 0 && (
        <Select
          value={selectedPhysicianId ?? "all"}
          onValueChange={(v) => onPhysicianChange(v === "all" ? null : v)}
        >
          <SelectTrigger className="h-8 w-[165px] text-xs">
            <SelectValue placeholder="All physicians" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All physicians</SelectItem>
            {physicianOptions.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Month jump filter */}
      {fiscalMonths.length > 0 && (
        <Select
          value={activeMonthKey ?? "all"}
          onValueChange={(v) => {
            if (v === "all") {
              onClearMonth()
            } else {
              const [year, month] = v.split("-").map(Number)
              onMonthSelect(month, year)
            }
          }}
        >
          <SelectTrigger className="h-8 w-[145px] text-xs">
            <SelectValue placeholder="All months" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {fiscalMonths.map((m) => (
              <SelectItem key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
