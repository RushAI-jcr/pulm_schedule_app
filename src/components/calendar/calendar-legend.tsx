"use client"

import { cn } from "@/lib/utils"
import { getRotationAccent } from "./calendar-tokens"


type Rotation = {
  _id: string
  name: string
  abbreviation: string
}

export function CalendarLegend({ rotations }: { rotations: Rotation[] }) {
  if (rotations.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {rotations.map((rotation, index) => {
        const accent = getRotationAccent(index)
        return (
          <span
            key={rotation._id}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium bg-card border border-border/60"
          >
            <span className={cn("h-2 w-2 rounded-full shrink-0", accent.dot)} />
            <span className="font-semibold text-foreground">{rotation.abbreviation}</span>
            <span className="text-muted-foreground hidden sm:inline">{rotation.name}</span>
          </span>
        )
      })}
    </div>
  )
}
