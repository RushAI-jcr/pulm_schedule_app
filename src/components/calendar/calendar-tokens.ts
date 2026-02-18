/**
 * Rotation accent color tokens for the calendar UI.
 *
 * Kept in a plain .ts file (no "use client") so it can be imported from
 * server components, tests, or any non-browser context without pulling in
 * React or browser APIs.
 */

export type RotationAccent = {
  borderL: string   // border-l color class, e.g. "border-teal-400"
  dot: string       // dot bg class, e.g. "bg-teal-400"
  subtleBg: string  // very light bg for pills, e.g. "bg-teal-50 dark:bg-teal-950/30"
}

// All class strings are complete static literals — no interpolation.
// Tailwind's JIT scanner must see full class names to avoid purging them.
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
