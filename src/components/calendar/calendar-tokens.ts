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
// Modern indigo theme palette: harmonized with #6366F1 primary
const ROTATION_ACCENTS: RotationAccent[] = [
  { borderL: "border-indigo-500",  dot: "bg-indigo-500",  subtleBg: "bg-indigo-50 dark:bg-indigo-950/30"  },  // Primary indigo
  { borderL: "border-blue-500",    dot: "bg-blue-500",    subtleBg: "bg-blue-50 dark:bg-blue-950/30"      },  // Cool blue
  { borderL: "border-purple-500",  dot: "bg-purple-500",  subtleBg: "bg-purple-50 dark:bg-purple-950/30"  },  // Rich purple
  { borderL: "border-cyan-500",    dot: "bg-cyan-500",    subtleBg: "bg-cyan-50 dark:bg-cyan-950/30"      },  // Bright cyan
  { borderL: "border-violet-500",  dot: "bg-violet-500",  subtleBg: "bg-violet-50 dark:bg-violet-950/30"  },  // Deep violet
  { borderL: "border-sky-500",     dot: "bg-sky-500",     subtleBg: "bg-sky-50 dark:bg-sky-950/30"        },  // Light sky
  { borderL: "border-fuchsia-500", dot: "bg-fuchsia-500", subtleBg: "bg-fuchsia-50 dark:bg-fuchsia-950/30" }, // Vibrant fuchsia
  { borderL: "border-pink-500",    dot: "bg-pink-500",    subtleBg: "bg-pink-50 dark:bg-pink-950/30"      },  // Warm pink
  { borderL: "border-rose-500",    dot: "bg-rose-500",    subtleBg: "bg-rose-50 dark:bg-rose-950/30"      },  // Bold rose
  { borderL: "border-teal-500",    dot: "bg-teal-500",    subtleBg: "bg-teal-50 dark:bg-teal-950/30"      },  // Cool teal
]

export function getRotationAccent(index: number): RotationAccent {
  return ROTATION_ACCENTS[index % ROTATION_ACCENTS.length]
}
