"use client"

import { cn } from "@/lib/utils"

type Rotation = {
  _id: string
  name: string
  abbreviation: string
}

export type RotationAccent = {
  borderL: string    // border-l color class, e.g. "border-teal-400"
  dot: string        // dot bg class, e.g. "bg-teal-400"
  subtleBg: string   // very light bg for pills
}

// Muted, desaturated accent palette — monochrome base + one hue per rotation
const ROTATION_ACCENTS: RotationAccent[] = [
  { borderL: "border-teal-400",    dot: "bg-teal-400",    subtleBg: "bg-teal-50 dark:bg-teal-950/30"      },
  { borderL: "border-violet-400",  dot: "bg-violet-400",  subtleBg: "bg-violet-50 dark:bg-violet-950/30"  },
  { borderL: "border-amber-400",   dot: "bg-amber-400",   subtleBg: "bg-amber-50 dark:bg-amber-950/30"    },
  { borderL: "border-rose-400",    dot: "bg-rose-400",    subtleBg: "bg-rose-50 dark:bg-rose-950/30"      },
  { borderL: "border-sky-400",     dot: "bg-sky-400",     subtleBg: "bg-sky-50 dark:bg-sky-950/30"        },
  { borderL: "border-emerald-400", dot: "bg-emerald-400", subtleBg: "bg-emerald-50 dark:bg-emerald-950/30" },
  { borderL: "border-orange-400",  dot: "bg-orange-400",  subtleBg: "bg-orange-50 dark:bg-orange-950/30"  },
  { borderL: "border-indigo-400",  dot: "bg-indigo-400",  subtleBg: "bg-indigo-50 dark:bg-indigo-950/30"  },
  { borderL: "border-fuchsia-400", dot: "bg-fuchsia-400", subtleBg: "bg-fuchsia-50 dark:bg-fuchsia-950/30" },
  { borderL: "border-lime-500",    dot: "bg-lime-500",    subtleBg: "bg-lime-50 dark:bg-lime-950/30"      },
]

export function getRotationAccent(index: number): RotationAccent {
  return ROTATION_ACCENTS[index % ROTATION_ACCENTS.length]
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
