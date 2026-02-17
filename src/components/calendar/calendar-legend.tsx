"use client"

import { cn } from "@/lib/utils"

type Rotation = {
  _id: string
  name: string
  abbreviation: string
}

// Deterministic rotation colors from a curated palette
const ROTATION_COLORS = [
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
]

export function getRotationColor(index: number): string {
  return ROTATION_COLORS[index % ROTATION_COLORS.length]
}

export function CalendarLegend({ rotations }: { rotations: Rotation[] }) {
  if (rotations.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {rotations.map((rotation, index) => (
        <span
          key={rotation._id}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
            getRotationColor(index)
          )}
        >
          <span className="font-bold">{rotation.abbreviation}</span>
          <span className="hidden sm:inline">{rotation.name}</span>
        </span>
      ))}
    </div>
  )
}
