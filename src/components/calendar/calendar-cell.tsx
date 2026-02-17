"use client"

import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { getRotationColor } from "./calendar-legend"

type CellData = {
  rotationId: string
  physicianId: string | null
  physicianName: string | null
  physicianInitials: string | null
}

export function CalendarCell({
  cell,
  rotationIndex,
  rotationAbbr,
  isHighlighted,
  className,
}: {
  cell: CellData
  rotationIndex: number
  rotationAbbr: string
  isHighlighted: boolean
  className?: string
}) {
  const hasAssignment = !!cell.physicianId

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex h-7 items-center justify-center rounded text-[10px] font-medium transition-opacity",
              hasAssignment
                ? getRotationColor(rotationIndex)
                : "bg-muted/50 text-muted-foreground/50",
              !isHighlighted && hasAssignment && "opacity-30",
              className
            )}
            role="gridcell"
            aria-label={
              hasAssignment
                ? `${rotationAbbr}: ${cell.physicianName}`
                : `${rotationAbbr}: Unassigned`
            }
          >
            {cell.physicianInitials ?? ""}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <p className="font-semibold">{rotationAbbr}</p>
          <p>{cell.physicianName ?? "Unassigned"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
