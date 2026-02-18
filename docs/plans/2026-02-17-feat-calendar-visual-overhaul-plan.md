---
title: "feat: Calendar Visual Overhaul — Apple-Inspired Layout and Color System"
type: feat
date: 2026-02-17
brainstorm: docs/brainstorms/2026-02-17-calendar-visual-overhaul-brainstorm.md
---

# Calendar Visual Overhaul — Apple-Inspired Layout and Color System

## Overview

Transform both calendar surfaces from a spreadsheet aesthetic into a clean, Apple Calendar-inspired experience. The year view stops scrolling horizontally (52-column grid) and becomes 12 months stacked vertically. The color system shifts from bright full-fill badges to a monochrome base with per-rotation accent left-borders and dots. The admin scheduling grid keeps its layout but looks like a real scheduling application instead of Excel.

**North star:** Calm, neutral base. Color is purposeful, not decorative. Today's date is unmistakable. Year view scrolls top-to-bottom.

---

## Problem Statement

| Problem | Current state | Target state |
|---|---|---|
| Year view requires horizontal scroll | 52-column transposed grid (`overflow-x-auto`) | 12 months stacked vertically, vertical-only scroll |
| Rotation colors are garish | Bright Tailwind fills (`bg-emerald-100 text-emerald-800`) on every cell | Neutral cards, one accent left-border + dot per rotation |
| Today is hard to spot | `bg-primary/15` on column, ring on cell | Prominent circle on day number + ring on cell (Apple-style) |
| Admin grid looks like Excel | Raw `<select>` in `bg-muted/30` cells, no color | Styled mini-card cells, rotation accent border, dashed unassigned |

**No changes to Convex backend.** All existing queries and data shapes remain unchanged.

---

## Technical Approach

### Architecture

```
src/
├── components/calendar/
│   ├── calendar-legend.tsx      ← CHANGE: new ROTATION_ACCENTS palette + updated legend UI
│   ├── calendar-cell.tsx        ← CHANGE: accent border system instead of full-fill bg
│   ├── calendar-grid-utils.ts   ← NEW: extract buildMonthGrid(), inferYearForMonth() shared logic
│   ├── year-month-stack.tsx     ← NEW: 12-month stacked vertical year view
│   ├── month-detail.tsx         ← CHANGE: new color system on pills, enhanced today highlight
│   └── year-overview.tsx        ← REMOVE: replaced by year-month-stack.tsx
└── app/(authenticated)/
    ├── calendar/page.tsx        ← CHANGE: swap YearOverview → YearMonthStack, simplify view toggle
    └── admin/calendar/page.tsx  ← CHANGE: restyle cells, add rotation dots, month separators
```

### Color System Design

Replace `getRotationColor(index): string` with `getRotationAccent(index): RotationAccent`:

```typescript
// src/components/calendar/calendar-legend.tsx

type RotationAccent = {
  borderL: string   // border-l-[3px] color class, e.g. "border-teal-400"
  dot: string       // dot background class, e.g. "bg-teal-400"
  text: string      // readable text class, e.g. "text-teal-700 dark:text-teal-300"
  subtleBg: string  // very light bg for pills, e.g. "bg-teal-50 dark:bg-teal-950/30"
}

const ROTATION_ACCENTS: RotationAccent[] = [
  { borderL: "border-teal-400",    dot: "bg-teal-400",    text: "text-teal-700 dark:text-teal-300",    subtleBg: "bg-teal-50 dark:bg-teal-950/30"    },
  { borderL: "border-violet-400",  dot: "bg-violet-400",  text: "text-violet-700 dark:text-violet-300", subtleBg: "bg-violet-50 dark:bg-violet-950/30" },
  { borderL: "border-amber-400",   dot: "bg-amber-400",   text: "text-amber-700 dark:text-amber-300",   subtleBg: "bg-amber-50 dark:bg-amber-950/30"   },
  { borderL: "border-rose-400",    dot: "bg-rose-400",    text: "text-rose-700 dark:text-rose-300",     subtleBg: "bg-rose-50 dark:bg-rose-950/30"     },
  { borderL: "border-sky-400",     dot: "bg-sky-400",     text: "text-sky-700 dark:text-sky-300",       subtleBg: "bg-sky-50 dark:bg-sky-950/30"       },
  { borderL: "border-emerald-400", dot: "bg-emerald-400", text: "text-emerald-700 dark:text-emerald-300", subtleBg: "bg-emerald-50 dark:bg-emerald-950/30" },
  { borderL: "border-orange-400",  dot: "bg-orange-400",  text: "text-orange-700 dark:text-orange-300", subtleBg: "bg-orange-50 dark:bg-orange-950/30" },
  { borderL: "border-indigo-400",  dot: "bg-indigo-400",  text: "text-indigo-700 dark:text-indigo-300", subtleBg: "bg-indigo-50 dark:bg-indigo-950/30" },
  { borderL: "border-fuchsia-400", dot: "bg-fuchsia-400", text: "text-fuchsia-700 dark:text-fuchsia-300", subtleBg: "bg-fuchsia-50 dark:bg-fuchsia-950/30" },
  { borderL: "border-lime-500",    dot: "bg-lime-500",    text: "text-lime-700 dark:text-lime-400",     subtleBg: "bg-lime-50 dark:bg-lime-950/30"     },
]

export function getRotationAccent(index: number): RotationAccent {
  return ROTATION_ACCENTS[index % ROTATION_ACCENTS.length]
}
```

All colors are explicitly enumerated (no dynamic class construction) so Tailwind's content scanner detects them.

### Year-Month Stack Layout

```
[  July 2025  ]                  ← text-2xl font-semibold, month section header
M    T    W    T    F    S    S
30 [  1 ] 2    3    4    5    6  ← [1] = today circle (bg-primary text-primary-foreground)
     ──────────────────────────
     ▌ICU: JS  ▌MICU: PK        ← accent-border pills (per week row, below day cells)

 7    8    9   10   11   12   13
     ──────────────────────────
     ▌ICU: JS  ▌CCU: RS  ...

[  August 2025  ]
...
```

The assignment pills sit below each week's day-number row, spanning all 7 columns — identical to `MonthDetail`'s rendering. Month labels act as scroll anchors (`id="month-{monthIndex}"`); the existing month-jump dropdown triggers `element.scrollIntoView()`.

### Admin Grid Cell Styling

```
Before (current):
┌──────────────────────┐
│  [select: —      ▾]  │   ← bg-muted/30, no color
└──────────────────────┘

After:
┌──────────────────────┐
│▌ JS                  │   ← teal left-border (3px), bg-card, initials as text
└──────────────────────┘

Unassigned:
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
  —                      ← dashed border, muted text
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
```

The `<select>` remains but is styled to be invisible (opacity-0, positioned over the cell content) for interaction, while a styled `<div>` renders beneath it showing the physician initials.

---

## Implementation Phases

### Phase 1: Color System Foundation

**Files:** `src/components/calendar/calendar-legend.tsx`

**Tasks:**
- [ ] Add `RotationAccent` type and `ROTATION_ACCENTS` array with 10 muted entries
- [ ] Export `getRotationAccent(index): RotationAccent` (keep old `getRotationColor` temporarily during migration)
- [ ] Update `CalendarLegend` component: replace full-fill badges with `dot + name` layout
  - Each rotation: `<span class="{accent.dot} h-2.5 w-2.5 rounded-full" /> abbreviation name`
  - Remove background fill from the outer badge wrapper

**Success:** `CalendarLegend` renders as dot-list, all 10 rotation colors visually distinct and muted.

---

### Phase 2: CalendarCell Update

**Files:** `src/components/calendar/calendar-cell.tsx`

**Tasks:**
- [ ] Import `getRotationAccent` instead of `getRotationColor`
- [ ] Restructure cell: `bg-card` base with `border-l-[3px] {accent.borderL}` + `rounded-sm`
- [ ] Show physician initials in `text-foreground` (not colored text)
- [ ] Keep `opacity-30` on dimmed (non-highlighted) cells — works the same way
- [ ] Unassigned cells: `border border-dashed border-border` on `bg-muted/20` base
- [ ] Remove `getRotationColor` import from this file

**Note:** `CalendarCell` is only used in `YearOverview` (which we're replacing) but the component will be reused if needed. Keep it updated anyway for clean deletion of old patterns.

---

### Phase 3: Shared Calendar Grid Utilities

**Files:** `src/components/calendar/calendar-grid-utils.ts` (new)

**Tasks:**
- [ ] Extract `buildMonthGrid(year, month, grid)` from `month-detail.tsx` into this new file
- [ ] Extract `inferYearForMonth(month, grid)` from `month-detail.tsx` into this new file
- [ ] Export `toLocalDate(dateStr)`, `toISODate(d)`, `isSameDay(a, b)` helpers from here too (currently duplicated between `year-overview.tsx` and `month-detail.tsx`)
- [ ] Update `month-detail.tsx` to import from `calendar-grid-utils.ts` instead of defining locally

**Note:** `year-overview.tsx` has its own copies of `toLocalDate`, `shortDate`, `getMonthAbbr` — these merge cleanly.

---

### Phase 4: New YearMonthStack Component

**Files:** `src/components/calendar/year-month-stack.tsx` (new)

**Props interface** (matches `YearOverview` props for drop-in replacement):
```typescript
export function YearMonthStack({
  grid,
  rotations,
  events,
  physicianId,
  visibleRotationIds,
  onWeekClick,
}: {
  grid: GridRow[]
  rotations: Rotation[]
  events: CalendarEvent[]
  physicianId: Id<"physicians"> | null
  visibleRotationIds?: Set<string> | null
  onWeekClick?: (weekNumber: number) => void
})
```

**Tasks:**
- [ ] Derive `fiscalMonths` array (unique year-month pairs from grid, in order) — same logic as `calendar/page.tsx`
- [ ] For each month, call `buildMonthGrid(year, month, grid)` and render a month block:
  - Month header: `<h2 id="month-{year}-{month}" class="text-2xl font-semibold ...">{monthLabel}</h2>`
  - Day-of-week header row: Mon–Sun labels (`text-xs font-semibold text-muted-foreground`)
  - For each week in the month grid:
    - Day number row (7 cells):
      - `isToday`: `inline-flex h-7 w-7 rounded-full bg-primary text-primary-foreground` circle
      - `isCurrentWeek` cell: `ring-2 ring-primary/30 bg-primary/5`
      - Out-of-month days: `text-muted-foreground/35 bg-muted/20`
      - Event dots at bottom of day cell (rose/sky/amber dots, same as MonthDetail)
    - Assignment pills row (below day cells, spanning week):
      - Filter by `visibleRotationIds`
      - Each pill: `border-l-[3px] {accent.borderL} bg-card px-2 py-0.5 rounded-sm text-xs`
      - Show `rotation.abbreviation • physicianInitials`
      - `isMe` indicator: same dot logic as MonthDetail
      - Dimmed when `physicianId` set and not matching: `opacity-25`
- [ ] Month separator: `mt-10 mb-4` spacing between months
- [ ] Mobile: keep the existing week-card layout from `YearOverview` (verbatim, update colors)
- [ ] `onWeekClick`: clicking any day cell or week row calls `onWeekClick(row.weekNumber)`

**Month-jump scroll behavior:** export a utility `scrollToMonth(year, month)` that calls `document.getElementById("month-{year}-{month}")?.scrollIntoView({ behavior: "smooth", block: "start" })`.

---

### Phase 5: MonthDetail Color Update

**Files:** `src/components/calendar/month-detail.tsx`

**Tasks:**
- [ ] Import `getRotationAccent` instead of `getRotationColor`
- [ ] Update assignment pills to use new style:
  - `border-l-[3px] {accent.borderL} {accent.subtleBg} px-2.5 py-1 rounded-sm`
  - Text: `text-foreground` for abbreviation, `text-muted-foreground` for initials
- [ ] Enhance today circle: already uses `bg-primary text-primary-foreground` — add `ring-2 ring-primary/30` on the cell container for current-week rows (not just the day)
- [ ] Import shared utilities from `calendar-grid-utils.ts`

---

### Phase 6: Calendar Page Integration

**Files:** `src/app/(authenticated)/calendar/page.tsx`

**Tasks:**
- [ ] Replace `import { YearOverview }` with `import { YearMonthStack }`
- [ ] Swap `<YearOverview>` with `<YearMonthStack>` in the render (same props)
- [ ] Update `handleMonthSelect` for the stack view: instead of switching `viewMode` to `"month"`, scroll to that month in the stack AND optionally keep the month-view drill-down behavior
  - Preferred: `scrollToMonth(year, month)` in year view, but if user explicitly clicks "Month" tab, switch view
- [ ] The "Year" tab label can remain as-is — the view is still the year view, just vertical now
- [ ] Remove `import { YearOverview }` entirely after swap

---

### Phase 7: Admin Grid Restyle

**Files:** `src/app/(authenticated)/admin/calendar/page.tsx`

**Tasks:**

**Rotation row headers:**
- [ ] Add `getRotationAccent(rotIdx)` call (import from `calendar-legend.tsx`)
- [ ] Rotation label: `<span class="h-2.5 w-2.5 rounded-full {accent.dot} mr-1.5 shrink-0" /> {rotation.abbreviation}`
- [ ] Row header styling: `bg-card border-r text-sm font-medium text-foreground` (remove `bg-background`)

**Week column headers:**
- [ ] Add a month-label header row above the W1–W52 row
- [ ] Compute `monthBreakSet` from `data.grid` (same algorithm as `YearOverview`)
- [ ] Month label cells: `text-[10px] font-semibold text-foreground bg-muted/30` at break points, `text-transparent` elsewhere
- [ ] Keep month boundary `border-l-2 border-muted-foreground/20` on both the month-label row and subsequent rows

**Assignment cells — styled overlay approach:**
- [ ] Wrap each grid cell in a `relative` container
- [ ] Below the select: render a styled `div` showing physician initials (or "—")
  - Assigned: `border-l-[3px] {accent.borderL} bg-card rounded-sm px-1.5 py-1 text-xs font-medium text-foreground`
  - Unassigned: `border border-dashed border-muted-foreground/30 bg-transparent rounded-sm px-1.5 py-1 text-xs text-muted-foreground/50`
- [ ] `<select>` becomes `absolute inset-0 opacity-0 cursor-pointer` (invisible, but interactive)
- [ ] Availability indicators (🔴🟡 prefix in option text) remain unchanged in the dropdown options
- [ ] When cell is `!isDraft`: both styled div and select get `pointer-events-none opacity-60`

**cFTE Summary:**
- [ ] Add a thin colored indicator bar (left-border) per physician row, using a muted green for on-target, rose for over-target — already uses `bg-rose-50` for over, just add left-border to reinforce

---

### Phase 8: Cleanup

**Files:** `src/components/calendar/year-overview.tsx`, `src/components/calendar/calendar-cell.tsx`

**Tasks:**
- [ ] Delete `year-overview.tsx` (fully replaced by `year-month-stack.tsx`)
- [ ] Delete `calendar-cell.tsx` if unused after the YearMonthStack doesn't use it (verify no other imports first)
- [ ] Remove old `getRotationColor` export from `calendar-legend.tsx` (after confirming zero remaining imports)
- [ ] Run `npm run lint` to catch any stale imports

---

## Acceptance Criteria

### Functional Requirements
- [ ] Year view renders 12 calendar month grids stacked vertically — no horizontal scrollbar
- [ ] Each month grid correctly shows Mon–Sun headers, day numbers, assignment pills per week row
- [ ] Today's date shows a filled primary-color circle on the day number
- [ ] Current week's row shows a subtle primary tint ring
- [ ] All filters (physician, rotation, month-jump) still work correctly
- [ ] Month-jump dropdown scrolls to the correct month in the stacked view
- [ ] Clicking a week/day in the year stack switches to month-detail view for that month
- [ ] My Calendar scope dims all non-personal assignments (opacity-25)
- [ ] Department scope shows all assignments equally
- [ ] Admin grid cells show physician initials with rotation-colored left border
- [ ] Unassigned admin cells show dashed border
- [ ] Admin month-label row appears above week-number row
- [ ] All `<select>` dropdowns in admin grid remain fully functional

### Non-Functional Requirements
- [ ] No new Convex queries or mutations — zero backend changes
- [ ] Both light and dark modes look clean (all accent colors have dark variants)
- [ ] Mobile view: stacked month cards remain readable; week cards keep their layout
- [ ] `npm run lint` passes (both tsconfigs + next build)

### Quality Gates
- [ ] `getRotationColor` has zero remaining import sites before deletion
- [ ] `YearOverview` has zero import sites before deletion
- [ ] No inline dynamic class construction (all Tailwind classes are static strings in arrays)

---

## Alternative Approaches Considered

| Approach | Rejected because |
|---|---|
| Keep year-grid, just fix colors | Doesn't solve horizontal scroll — main UX complaint |
| CSS variable token system | Infrastructure scope-creep; out of scope per brainstorm |
| Reuse `MonthDetail` with 12 instances | `MonthDetail` has navigation controls (chevrons, back button) baked in — too heavy for stack context; cleaner to write dedicated `YearMonthStack` |
| Drag-and-drop in admin | Out of scope per brainstorm |
| Animated view transitions | Out of scope per brainstorm |

---

## Dependencies & Prerequisites

- No new npm packages required — Tailwind, shadcn/ui, and lucide-react already cover all needed primitives
- No Convex schema changes
- Existing `buildMonthGrid` logic in `month-detail.tsx` is correct and can be extracted as-is

---

## Risk Analysis

| Risk | Likelihood | Mitigation |
|---|---|---|
| Tailwind purges dynamic classes | Low | All accent class strings are static in `ROTATION_ACCENTS` array |
| Admin `<select>` + overlay interaction breaks on some browsers | Low | Use `absolute inset-0 opacity-0` overlay — standard pattern |
| Month-jump scroll lands on wrong month | Low | `id` attribute on each month header must use consistent `"month-{year}-{month}"` format |
| `buildMonthGrid` extraction breaks `MonthDetail` | Low | Pure function, no side effects — trivial extraction |
| 12 month grids slow to render | Very Low | 12 × ~5 week rows × 7 cells = 420 cells max. No virtualization needed. |

---

## File Reference Map

| File | Lines to pay attention to |
|---|---|
| `src/components/calendar/calendar-legend.tsx` | 12–23 (`ROTATION_COLORS` array), 25–27 (`getRotationColor`), 29–48 (`CalendarLegend`) |
| `src/components/calendar/calendar-cell.tsx` | 10 (import), 39–53 (className logic with `getRotationColor`) |
| `src/components/calendar/month-detail.tsx` | 56–83 (`buildMonthGrid`), 86–98 (`inferYearForMonth`), 297–315 (assignment pill rendering) |
| `src/components/calendar/year-overview.tsx` | 35–50 (date helpers), 83–107 (month break computation) |
| `src/app/(authenticated)/calendar/page.tsx` | 22 (`ViewMode` type), 225–233 (`YearOverview` usage) |
| `src/app/(authenticated)/admin/calendar/page.tsx` | 301 (grid template), 315–366 (rotation rows + cell rendering) |

---

## Out of Scope

- CSS variable token system
- Drag-and-drop assignment in admin grid
- Animated view transitions
- Print stylesheet
- New Convex queries, mutations, or schema changes
- Week-detail or agenda list view
- Any changes to sidebar, navigation, or non-calendar pages
