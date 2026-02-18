---
title: "Calendar visual overhaul: 12-month stacked grid, rotation accent system, and P2 code review fixes"
date: "2026-02-17"
problem_type: feature-implementation
severity: medium
modules:
  - src/components/calendar/year-month-stack.tsx
  - src/components/calendar/calendar-grid-utils.ts
  - src/components/calendar/calendar-legend.tsx
  - src/components/calendar/month-detail.tsx
  - src/components/calendar/ics-export-button.tsx
  - src/hooks/use-today.ts
  - src/app/(authenticated)/calendar/page.tsx
  - src/app/(authenticated)/admin/calendar/page.tsx
tags:
  - calendar
  - ui-redesign
  - react-hooks
  - performance
  - memoization
  - tailwind
  - ics-export
  - code-review
  - next-js-ssr
symptoms:
  - 52-column horizontal-scroll grid replaced with 12-month stacked vertical layout
  - rotation color system migrated to monochrome base with per-rotation left-border accent
  - scrollToMonth DOM side-effect extracted from pure utility into component layer
  - monthAnchorId() factory introduced to eliminate implicit string contract
  - useToday hook added with midnight auto-refresh to prevent stale date renders
  - double-scan find+indexOf replaced with findIndex and rotationMap lookup
  - duplicate exportPhysicianId memo removed
  - buildMonthGrid memoized with useMemo to prevent 12x per-render recomputation
  - ICS blob URL revoke timeout extended from 1s to 60s with isExporting guard
  - dead RotationAccent.text field removed from type definition
  - sanitizeConvexId added to ICS UID field to prevent header injection
---

# Calendar Visual Overhaul: 12-Month Stacked Grid + Accent Color System

## Problem

The physician-facing calendar used a 52-column transposed grid — rotations as rows, fiscal weeks as columns. This required horizontal scrolling to see the full year, looked like a spreadsheet, and used garish full-fill Tailwind badge colors for rotations. The admin scheduling grid had bare `<select>` dropdowns with no visual styling. Today's date was subtle and easy to miss.

## Solution

Replaced the horizontal year grid with a 12-month stacked vertical layout (Apple Calendar aesthetic), introduced a muted monochrome + accent color system, restyled the admin grid with native-select overlay, and addressed all P2 issues surfaced in a post-implementation multi-agent code review.

---

## Key Patterns and Solutions

### 1. Static Tailwind Color System for Rotation Accents

**The mistake to avoid:** Dynamic class construction such as `` `bg-${color}-400` `` causes Tailwind's JIT scanner to purge those classes at build time — the styles are absent in production.

**Correct pattern:** All Tailwind class strings must appear as complete, static literals in source. Use an index-based lookup array:

```ts
// calendar-legend.tsx
export type RotationAccent = {
  borderL: string   // "border-teal-400"
  dot: string       // "bg-teal-400"
  subtleBg: string  // "bg-teal-50 dark:bg-teal-950/30"
}

const ROTATION_ACCENTS: RotationAccent[] = [
  { borderL: "border-teal-400",    dot: "bg-teal-400",    subtleBg: "bg-teal-50 dark:bg-teal-950/30"    },
  { borderL: "border-violet-400",  dot: "bg-violet-400",  subtleBg: "bg-violet-50 dark:bg-violet-950/30" },
  // ... 8 more — all fully static strings, never interpolated
]

export function getRotationAccent(index: number): RotationAccent {
  return ROTATION_ACCENTS[index % ROTATION_ACCENTS.length]
}
```

**Rule:** Every conditionally-applied or lookup-based Tailwind class must exist as an uninterpolated complete string somewhere Tailwind scans.

---

### 2. DOM Side-Effects Must Not Live in Pure Utility Files

**The mistake:** `scrollToMonth` (calls `document.getElementById`) was placed in `calendar-grid-utils.ts` — a `.ts` file with no `"use client"` directive. If any server component ever imports a pure function from that file, Next.js will crash at SSR time because `document` is undefined on the server.

**Correct pattern:** Keep pure date functions in a pure `.ts` utility file. Move any DOM side-effect out to the component layer:

```ts
// calendar-grid-utils.ts — PURE functions only, no "use client" needed
export function monthAnchorId(year: number, month: number): string {
  return `month-${year}-${month}`
}
// buildMonthGrid, toLocalDate, isSameDay, deriveFiscalMonths — all pure ✓

// calendar/page.tsx — DOM side-effect lives here ("use client" present)
requestAnimationFrame(() => {
  document.getElementById(monthAnchorId(entry.year, entry.month))
    ?.scrollIntoView({ behavior: "smooth", block: "start" })
})
```

**Rule:** A `.ts` utility file without `"use client"` must contain zero calls to `document`, `window`, or any browser-only API.

---

### 3. `monthAnchorId()` Factory — Eliminate Implicit String Contracts

**The mistake:** The same string template `` `month-${year}-${month}` `` appeared in both the renderer (as the element `id`) and the scroll caller. A format change in one file silently broke the other — no TypeScript error, no lint warning.

**Correct pattern:** Extract to a single shared factory function. Both sides import and call it:

```ts
// calendar-grid-utils.ts
export function monthAnchorId(year: number, month: number): string {
  return `month-${year}-${month}`
}

// year-month-stack.tsx — renderer
<div id={monthAnchorId(year, month)}>

// calendar/page.tsx — scroll caller
document.getElementById(monthAnchorId(entry.year, entry.month))
```

**Rule:** Any string key, ID format, or slug constructed in more than one place must live in a single shared constant or builder function.

---

### 4. `useToday()` — Midnight-Safe Current Date Hook

**The mistake:** `useMemo(() => new Date(), [])` captures today at mount time and never updates. A physician leaving the calendar open overnight sees yesterday highlighted as "today."

**Correct pattern:** A self-rescheduling `setTimeout` that fires at each midnight:

```ts
// src/hooks/use-today.ts
function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function msUntilMidnight(): number {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  return midnight.getTime() - now.getTime()
}

export function useToday(): Date {
  const [today, setToday] = useState(startOfToday)
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>
    const schedule = () => {
      id = setTimeout(() => {
        setToday(startOfToday())
        schedule() // re-arm for next midnight
      }, msUntilMidnight())
    }
    schedule()
    return () => clearTimeout(id) // cleanup on unmount
  }, [])
  return today
}
```

**Key detail:** `id` is `let`-declared so the cleanup always cancels the most recently scheduled timeout, even after re-schedules.

**Rule:** Never `useMemo(() => new Date(), [])` in a calendar or scheduling context. Use `useToday()`.

---

### 5. Admin Grid Overlay Pattern — Styled Display Over Native Select

`<select>` elements resist custom styling (border-left accent, initials display). Custom dropdowns break keyboard accessibility and mobile pickers. The solution: layer an invisible `<select>` absolutely over a fully-styled display `<div>`. The div handles visuals; the select handles all native interaction.

```tsx
<div className="relative">
  {/* Visual layer — fully styleable */}
  <div className={cn(
    "h-7 flex items-center px-1.5 rounded-sm text-xs font-medium",
    assignedPhysician
      ? cn("border-l-[3px] bg-card text-foreground", accent.borderL)
      : "border border-dashed border-muted-foreground/30 text-muted-foreground/40"
  )}>
    {assignedPhysician?.initials ?? "—"}
  </div>

  {/* Interaction layer — invisible, covers the visual layer exactly */}
  <select
    className="absolute inset-0 opacity-0 w-full cursor-pointer disabled:cursor-default"
    value={currentPhysicianId}
    onChange={(e) => handleAssignCell(weekId, rotationId, e.target.value || null)}
    disabled={!isDraft}
    aria-label={`${rotation.abbreviation} week ${weekRow.weekNumber}`}
  >
    <option value="">—</option>
    {physicians.map(p => <option key={p.id} value={p.id}>{prefix}{p.initials}</option>)}
  </select>
</div>
```

**Requirements:** Parent `position: relative`; select `position: absolute; inset: 0; opacity: 0`. Select must be controlled (`value` + `onChange`) so the display layer stays in sync.

---

### 6. Memoize Expensive Computations Called in JSX Maps

**The mistake:** `buildMonthGrid(year, month, grid)` was called 12 times inline inside a JSX `.map()` without `useMemo`. On every re-render (filter changes, scope toggles, Convex ticks), 12 full grid scans ran — even when `grid` was unchanged.

**Correct pattern:** Hoist into a single `useMemo` with the correct dependency array:

```ts
const monthGrids = useMemo(
  () => fiscalMonths.map(({ month, year }) => ({
    month,
    year,
    calendarWeeks: buildMonthGrid(year, month, grid),
  })),
  [fiscalMonths, grid]
)
// JSX iterates monthGrids — zero recomputation on stable-grid re-renders
```

**Rule:** Any O(n) or higher function called inside a JSX `.map()` must be wrapped in `useMemo`.

---

### 7. Pre-Build Lookup Maps for O(1) Pill Rendering

**The mistake:** Each assignment pill called `rotations.find()` then `rotations.indexOf()` — two O(n) scans of the same array per pill.

**Correct pattern:** Build a `Map` once in `useMemo`, then do O(1) lookups per pill:

```ts
const rotationMap = useMemo(() => {
  const map = new Map<string, { rotation: Rotation; index: number }>()
  rotations.forEach((r, i) => map.set(String(r._id), { rotation: r, index: i }))
  return map
}, [rotations])

// In pill render:
const entry = rotationMap.get(String(cell.rotationId))
if (!entry) return null
const { rotation, index: rotIdx } = entry
```

**Simpler alternative** when index isn't needed: `Array.prototype.findIndex` replaces `find + indexOf` in a single pass:

```ts
const rotIdx = rotations.findIndex(r => String(r._id) === String(cell.rotationId))
if (rotIdx === -1) return null
const rotation = rotations[rotIdx]
```

---

### 8. ICS Blob URL — Revocation Timing and Double-Click Guard

**The mistake:** `setTimeout(() => URL.revokeObjectURL(url), 1000)` — 1 second is a guess. On slow mobile, the browser hasn't started the download yet and the object URL is revoked, producing a blank `.ics` file.

**Correct pattern:**

```ts
function downloadIcs(icsString: string, filename: string) {
  const blob = new Blob([icsString], { type: "text/calendar;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 60s: object URLs are in-process memory, not network resources.
  // Revoking too early breaks download on slow devices.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
```

Add `isExporting` state to prevent concurrent double-click exports:

```tsx
const [isExporting, setIsExporting] = useState(false)
const handleExport = () => {
  if (isExporting) return
  setIsExporting(true)
  try { downloadIcs(...) } finally { setIsExporting(false) }
}
```

---

### 9. Sanitize Opaque IDs Before ICS Embedding

Convex document IDs may contain characters that create interoperability issues in some calendar clients. Sanitize before embedding in `UID:` fields:

```ts
function sanitizeConvexId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_")
}

// In UID construction:
`UID:assignment-${sanitizeConvexId(assignment.weekId)}-${sanitizeConvexId(assignment.rotationId)}@rush-pccm`
```

---

## Dead Code Patterns Found (Avoid These)

| Pattern | Problem | Fix |
|---|---|---|
| Type field defined, never read | Misleads future developers | Only define type fields with at least one consuming callsite |
| Utility extracted but old duplicate left in place | Creates two sources of truth that can diverge | Grep and remove all duplicates in the same PR as the extraction |
| Two `useMemo` with identical logic and deps | Compute same value twice; diverge silently if one is updated | Merge into one memo |

---

## Code Review Checklist (10 Rules)

| # | Check |
|---|---|
| 1 | No browser APIs (`document`, `window`) in `.ts` utility files without `"use client"` |
| 2 | No `useMemo(() => new Date(), [])` — use `useToday()` with midnight refresh |
| 3 | No `.find()` + `.indexOf()` double scans — use `findIndex` or a pre-built `Map` |
| 4 | No string template duplicated across files — extract to a shared key builder |
| 5 | No expensive functions in JSX `.map()` without `useMemo` on the outer result |
| 6 | No magic number timeouts — named constants with explanatory comments |
| 7 | No type fields without a consuming callsite |
| 8 | When extracting a utility, all former inline duplicates removed in the same PR |
| 9 | No duplicate `useMemo` blocks with identical logic and deps |
| 10 | No dynamic Tailwind class interpolation — use static lookup objects |

---

## Files Changed

| File | Change |
|---|---|
| `src/components/calendar/calendar-legend.tsx` | New `RotationAccent` type (3 fields, not 4), `getRotationAccent()`, `CalendarLegend` with dot style |
| `src/components/calendar/calendar-grid-utils.ts` | Shared pure utils: `buildMonthGrid`, `deriveFiscalMonths`, `monthAnchorId`, date helpers |
| `src/components/calendar/year-month-stack.tsx` | New 12-month stacked year view; `rotationMap` useMemo; memoized `monthGrids` |
| `src/components/calendar/month-detail.tsx` | `useToday()`, `findIndex`, `deriveFiscalMonths(grid)`, shared imports |
| `src/hooks/use-today.ts` | New hook: midnight-safe current date |
| `src/components/calendar/ics-export-button.tsx` | 60s blob URL + `isExporting` guard; private `GridRow` type removed (uses Convex inferred type) |
| `src/shared/services/masterCalendarExport.ts` | `sanitizeConvexId()` for ICS UID fields |
| `src/app/(authenticated)/calendar/page.tsx` | `YearMonthStack` swap; `monthAnchorId` + `rAF` scroll; `exportPhysicianId` memo deleted |
| `src/app/(authenticated)/admin/calendar/page.tsx` | Rotation accent dots, month-label header row, overlay cell pattern |
| Deleted: `year-overview.tsx`, `calendar-cell.tsx` | Replaced by `YearMonthStack`; `CalendarCell` had no other consumers |

---

## Related Documentation

- `docs/plans/2026-02-17-feat-calendar-visual-overhaul-plan.md` — Implementation plan with phase breakdown and file map
- `docs/brainstorms/2026-02-17-calendar-visual-overhaul-brainstorm.md` — Design decisions and approach selection
- `docs/plans/2026-02-17-feat-calendar-filters-ics-export-plan.md` — ICS export architecture and RFC 5545 event format
- `docs/plans/2026-02-17-feat-ui-ux-overhaul-plan.md` — Original UI overhaul plan (Phase 3: calendar components)
- `docs/solutions/logic-errors/convex-backend-audit-type-safety-and-validators.md` — Convex function type safety patterns used by calendar queries

## Open P1 Todos (Not Yet Fixed)

The following issues were identified during code review and documented in `todos/` but not yet fixed:

- `todos/012` — `handleMonthSelect` drops `year` argument (silent TypeScript structural assignability)
- `todos/013` — `scrollToMonth` fires before React commits DOM after FY switch (now partially mitigated by rAF)
- `todos/014` — No per-cell in-flight guard on `handleAssignCell`
- `todos/015` — Four independent boolean flags allow concurrent admin operations
- `todos/016` — `GridRow` type divergence in `ics-export-button.tsx`
