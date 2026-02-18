---
title: "feat: Calendar Filters + ICS Export"
type: feat
date: 2026-02-17
---

# Calendar Filters + ICS Export

## Context

The published calendar is currently browsable only with a FY selector and a binary "My / Department" scope toggle. Physicians need to filter by month, rotation, or a specific colleague, and to download their personal schedule directly into Apple Calendar, Google Calendar, or Outlook. All required data is already fetched by the existing `getPublishedCalendarByFiscalYear` query — no new Convex functions are needed.

---

## Overview

Add four filter controls to the calendar page and a one-click ICS download. Filtering is pure client-side derived state from data already in memory. Export reuses the existing `buildMasterCalendarIcs()` utility from `src/shared/services/masterCalendarExport.ts`.

---

## Proposed Solution

### New filter state in `calendar/page.tsx`

```ts
const [selectedPhysicianId, setSelectedPhysicianId] = useState<Id<"physicians"> | null>(null)
const [selectedRotationId, setSelectedRotationId]   = useState<string | null>(null)
// Month filter just drives activeMonth + viewMode
```

**Physician filter** — overrides `effectivePhysicianId` when not in "My Calendar" scope.
**Rotation filter** — passed as `visibleRotationIds: Set<string>` to child components to hide non-matching rows.
**Month filter** — a quick-jump Select that sets `activeMonth` and flips `viewMode` to `"month"`.
**FY filter** — already handled by `FySelector`.

All option data is derived client-side from `calendarData` (no extra queries):
- Physician options: unique entries from `grid[*].cells[*].{ physicianId, physicianName }`
- Rotation options: `calendarData.rotations`
- Month options: fiscal months derived via the same `inferYearForMonth` logic already in `MonthDetail`

---

## Files to Change

| File | Change |
|---|---|
| `src/app/(authenticated)/calendar/page.tsx` | Add filter state; derive `filteredPhysicianId`, `visibleRotationIds`; render `<CalendarFilters>`; add ICS export button |
| `src/components/calendar/year-overview.tsx` | Accept `visibleRotationIds?: Set<string>`; skip rotation rows not in set |
| `src/components/calendar/month-detail.tsx` | Accept `visibleRotationIds?: Set<string>`; skip cells not in set |
| `src/components/calendar/calendar-filters.tsx` | **New** — filter bar with Physician, Rotation, Month selects |
| `src/components/calendar/ics-export-button.tsx` | **New** — export button: builds `MasterCalendarExportData` from `calendarData`, calls `buildMasterCalendarIcs`, triggers download |

No Convex functions, schema changes, or new npm packages required. `buildMasterCalendarIcs` and `MasterCalendarExportData` already exist in `src/shared/services/masterCalendarExport.ts`.

---

## Implementation Plan

### Step 1 — `CalendarFilters` component

**File:** `src/components/calendar/calendar-filters.tsx`

```tsx
// Props
{
  rotations: Rotation[]
  physicians: { id: Id<"physicians">; name: string }[]
  fiscalMonths: { month: number; year: number; label: string }[]
  selectedRotationId: string | null
  selectedPhysicianId: Id<"physicians"> | null
  activeMonth: number | null
  viewMode: "year" | "month"
  onRotationChange: (id: string | null) => void
  onPhysicianChange: (id: Id<"physicians"> | null) => void
  onMonthChange: (month: number | null) => void
}
```

Renders three `Select` components using the existing Radix UI select pattern from `FySelector`:
1. **Rotation** — "All rotations" + one item per `calendarData.rotations` entry
2. **Physician** — "All physicians" + sorted unique physicians from grid cells (or "Me" pre-selected in My Calendar scope)
3. **Month** — "All months" (year view) + fiscal month entries (jumps to month view on select)

Physician selector is hidden when `scopeMode === "my"` (already locked to the signed-in physician).

---

### Step 2 — Derive filtered props in `calendar/page.tsx`

```ts
// Effective physician for highlighting/dimming
const filteredPhysicianId = useMemo(() => {
  if (scopeMode === "my") return physicianId          // signed-in physician
  return selectedPhysicianId                           // null = show all
}, [scopeMode, physicianId, selectedPhysicianId])

// Rotation visibility set
const visibleRotationIds = useMemo(() => {
  if (!selectedRotationId) return null                 // null = show all
  return new Set([selectedRotationId])
}, [selectedRotationId])

// Physician options for filter UI
const physicianOptions = useMemo(() => {
  if (!calendarData) return []
  const map = new Map<string, string>()
  for (const row of calendarData.grid)
    for (const cell of row.cells)
      if (cell.physicianId && cell.physicianName)
        map.set(String(cell.physicianId), cell.physicianName)
  return [...map.entries()]
    .map(([id, name]) => ({ id: id as Id<"physicians">, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}, [calendarData])
```

---

### Step 3 — Update `YearOverview` and `MonthDetail`

Add optional prop:
```ts
visibleRotationIds?: Set<string> | null
```

In `YearOverview` rotation row loop — skip rows where:
```ts
visibleRotationIds && !visibleRotationIds.has(String(rotation._id))
```

In `MonthDetail` cell render loop — same check on each cell's `rotationId`.

---

### Step 4 — ICS Export Button

**File:** `src/components/calendar/ics-export-button.tsx`

Builds `MasterCalendarExportData` from the Convex query response already in memory, then calls `buildMasterCalendarIcs()`:

```ts
function buildExportData(
  calendarData: CalendarQueryResult,
  forPhysicianId: Id<"physicians"> | null,    // null = full department
  fiscalYearLabel: string
): MasterCalendarExportData {
  // Filter assignments to the target physician (or keep all)
  const assignments = calendarData.grid
    .flatMap(row => row.cells
      .filter(cell => cell.physicianId && (!forPhysicianId || String(cell.physicianId) === String(forPhysicianId)))
      .map(cell => ({
        physicianId: String(cell.physicianId!),
        physicianName: cell.physicianName!,
        physicianInitials: cell.physicianInitials!,
        weekId: String(row.weekId),
        weekNumber: row.weekNumber,
        weekStartDate: row.startDate,
        weekEndDate: row.endDate,
        rotationId: String(cell.rotationId),
        rotationName: calendarData.rotations.find(r => String(r._id) === String(cell.rotationId))?.name ?? "",
        rotationAbbreviation: calendarData.rotations.find(r => String(r._id) === String(cell.rotationId))?.abbreviation ?? "",
      }))
    )
  // ... build full MasterCalendarExportData shape and call buildMasterCalendarIcs()
}
```

Download trigger using the same pattern already in the admin page (`App.tsx` line 85–93):
```ts
const blob = new Blob([icsString], { type: "text/calendar;charset=utf-8" })
const url = URL.createObjectURL(blob)
const a = document.createElement("a")
a.href = url; a.download = `${fyLabel}-schedule.ics`
document.body.appendChild(a); a.click(); a.remove()
setTimeout(() => URL.revokeObjectURL(url), 1000)
```

**Filename conventions:**
- Personal export: `FY2025-2026-JCR-schedule.ics`
- Department export: `FY2025-2026-department.ics`

The button is placed in the controls row of `calendar/page.tsx` next to the scope/view tabs. In "My Calendar" mode it exports the signed-in physician. In "Department" mode with a physician selected it exports that physician; with no physician selected it exports the full department.

---

## ICS Format Notes

`buildMasterCalendarIcs` already emits correct RFC 5545 all-day events:
```
DTSTART;VALUE=DATE:20250623   ← Monday (inclusive)
DTEND;VALUE=DATE:20250630     ← following Monday (exclusive)
```

Each VEVENT UID: `assignment-{weekId}-{rotationId}-{physicianId}@rush-pccm` — stable across re-exports, so calendar clients update rather than duplicate.

---

## Acceptance Criteria

- [ ] Rotation selector filters which rotation rows appear in both year and month views
- [ ] Physician selector (Department scope) highlights/dims one physician across all views
- [ ] Month selector jumps to month view for that fiscal month
- [ ] "My Calendar" scope hides the physician selector (locked to signed-in user)
- [ ] Clearing any filter restores full view without page reload
- [ ] Export button downloads a valid `.ics` file
- [ ] Personal ICS: one VEVENT per week on service, spanning Mon–Sun as an all-day event
- [ ] VEVENT SUMMARY: `"{Rotation} - {Physician Name}"` (e.g. `"MICU 1 - JC Rojas"`)
- [ ] File imports correctly into Apple Calendar, Google Calendar, and Outlook
- [ ] Department export includes all physicians' assignments
- [ ] TypeScript compiles cleanly across both `tsconfig.json` and `convex/tsconfig.json`

---

## Key File References

- `src/app/(authenticated)/calendar/page.tsx` — main page, owns filter state
- `src/components/calendar/year-overview.tsx` — add `visibleRotationIds` prop
- `src/components/calendar/month-detail.tsx` — add `visibleRotationIds` prop
- `src/components/calendar/fy-selector.tsx` — reference for `Select` pattern
- `src/shared/services/masterCalendarExport.ts:252` — `buildMasterCalendarIcs()` (already implemented)
- `src/shared/services/masterCalendarExport.ts:47` — `MasterCalendarExportData` type
- `convex/functions/masterCalendar.ts:859` — `getPublishedCalendarByFiscalYear` query shape
- `src/components/ui/select.tsx` — Select UI component used throughout

---

## Verification

1. `npm run dev` — open `/calendar`, confirm filter dropdowns appear
2. Select a rotation — only that rotation's row shows in year/month view
3. Select a physician in Department mode — other physicians dim out
4. Select a month — view switches to month view for that month
5. Click Export — `.ics` file downloads; drag into Apple Calendar → week-spanning all-day events appear with correct dates and rotation names
6. `npm run lint` — both TypeScript configs + next build pass clean
