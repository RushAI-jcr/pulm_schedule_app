"use client"

import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StatusBadge } from "@/components/shared/status-badge"

export function FySelector({
  value,
  onValueChange,
}: {
  value: Id<"fiscalYears"> | null
  onValueChange: (id: Id<"fiscalYears">) => void
}) {
  const fiscalYears = useQuery(api.functions.fiscalYears.getFiscalYears)

  if (!fiscalYears) return null

  const sorted = [...fiscalYears].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  )

  return (
    <Select
      value={value ?? undefined}
      onValueChange={(v) => onValueChange(v as Id<"fiscalYears">)}
    >
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select fiscal year" />
      </SelectTrigger>
      <SelectContent>
        {sorted.map((fy) => (
          <SelectItem key={fy._id} value={fy._id}>
            <span className="flex items-center gap-2">
              {fy.label}
              <StatusBadge status={fy.status} />
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
