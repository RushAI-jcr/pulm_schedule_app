"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/shared/components/ui/button"
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

type ActivePeriod = {
  month: number
  year: number
}

interface CalendarFiltersProps {
  rotations: Rotation[]
  physicianOptions: PhysicianOption[]
  fiscalMonths: FiscalMonth[]
  scopeMode: "my" | "department"
  selectedServiceIds: string[]
  selectedPhysicianId: string | null
  activePeriod: ActivePeriod | null
  viewMode: "year" | "month"
  onServiceToggle: (ids: string[]) => void
  onClearServices: () => void
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
  selectedServiceIds,
  selectedPhysicianId,
  activePeriod,
  viewMode,
  onServiceToggle,
  onClearServices,
  onPhysicianChange,
  onMonthSelect,
  onClearMonth,
  className,
}: CalendarFiltersProps) {
  const activeMonthKey =
    activePeriod !== null && viewMode === "month"
      ? fiscalMonths.some(
          (m) => m.month === activePeriod.month && m.year === activePeriod.year
        )
          ? `${activePeriod.year}-${activePeriod.month}`
          : undefined
      : undefined

  const serviceGroups = useMemo(() => {
    const groups = new Map<string, { label: string; ids: string[] }>()

    for (const rotation of rotations) {
      const abbreviation = rotation.abbreviation.trim()
      const normalized = abbreviation.toUpperCase()
      const key = normalized.startsWith("MICU") ? "MICU" : abbreviation
      const label = key === "MICU" ? "MICU" : abbreviation

      if (!groups.has(key)) {
        groups.set(key, { label, ids: [] })
      }
      groups.get(key)!.ids.push(rotation._id)
    }

    return Array.from(groups.values())
  }, [rotations])

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {/* Service filter */}
      {rotations.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={selectedServiceIds.length === 0 ? "default" : "outline"}
            onClick={onClearServices}
            className="h-8 text-xs"
          >
            All services
          </Button>
          {serviceGroups.map((service) => {
            const isActive =
              service.ids.length > 0 &&
              service.ids.every((rotationId) => selectedServiceIds.includes(rotationId))
            return (
              <Button
                key={service.label}
                type="button"
                size="sm"
                variant={isActive ? "default" : "outline"}
                onClick={() => onServiceToggle(service.ids)}
                className="h-8 text-xs"
                title={service.label}
              >
                {service.label}
              </Button>
            )
          })}
        </div>
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
