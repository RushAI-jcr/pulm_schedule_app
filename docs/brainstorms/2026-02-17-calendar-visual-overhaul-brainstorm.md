# Calendar Visual Overhaul — Brainstorm
**Date:** 2026-02-17
**Status:** Ready for planning

---

## What We're Building

A full visual redesign of both calendar surfaces in the Rush PCCM scheduling app:

1. **Physician calendar** — Replace the transposed 52-week year-overview grid (horizontal scroll) with a 12-month stacked vertical layout as the default year view. Apply a unified monochrome + per-rotation accent color system. Make today's date stand out clearly.

2. **Admin scheduling grid** — Keep the underlying layout (rotations as rows, weeks as columns) but transform the raw spreadsheet aesthetic into a proper scheduling app: styled cells, colored accent borders per rotation, and visual hierarchy that doesn't look like Excel.

The north star is Apple Calendar: clean, airy, legible at a glance, with a calm neutral base and color used purposefully.

---

## Why This Approach

**Approach 2 (New year view + color system)** was chosen over:
- Approach 1 (surface polish only) — doesn't solve the horizontal scroll UX problem
- Approach 3 (full design system) — CSS token infrastructure is out of scope for now

This approach solves the most painful UX issues (scroll direction, odd colors, spreadsheet feel) without requiring a full design token system rewrite.

---

## Key Decisions

### 1. Year View Layout
- **Decision:** Replace `YearOverview` (52 columns × N rotation rows) with a 12-month stacked vertical component
- **New structure:** Each month rendered as a Mon–Sun 7-column grid (standard calendar layout)
- **Within each day cell:** Colored accent pills showing rotation abbreviation + physician initials for all assignments that day
- **Scroll direction:** Vertical only — users scroll down through January → December
- **Month navigation shortcut:** Keep the existing month-jump dropdown; clicking a month label jumps to that month in the scroll
- **Drill-down:** Clicking a week/day still navigates to the month-detail view for that week

### 2. Color System — Monochrome + Per-Rotation Accent
- **Base:** Neutral gray cards everywhere (`bg-card`, `border`, `text-foreground`)
- **Per-rotation accent:** Each rotation gets one accent color expressed as a left border (3–4px) and a matching dot/badge, not a full background fill
- **Palette:** Replace the current 10-color Tailwind cycle with a curated set of 10 muted/desaturated accents (e.g., slate-teal, slate-violet, slate-rose, slate-amber, slate-sky, slate-emerald, slate-orange, slate-indigo, slate-fuchsia, slate-lime) — all at reduced saturation vs. current bright Tailwind defaults
- **Event colors remain semantic:** Federal holidays = rose, conferences = sky, other = amber
- **My shift vs. colleague:** In "My Calendar" scope, the signed-in physician's assignments get full accent color; all others get 40% opacity — same as current opacity logic but more visually clean with the new color system

### 3. Today Highlight
- **Decision:** Strong, clear today marker — primary accent circle on the day number (like Apple's red circle), plus a subtle `ring-2` on the cell itself
- **This week:** In the year view, the current week's row/cell gets a light primary tint background

### 4. Admin Grid Aesthetics
- **Keep:** Transposed layout (rotations as rows, weeks as columns), `<select>` dropdowns for assignment (functional requirement)
- **Change:** Style each cell as a mini card rather than a bare table cell. Selected physician shown as a colored chip with rotation accent border. Unassigned cells are clearly styled (dashed border, muted placeholder text)
- **Month separators:** Visual vertical dividers between months (currently just a border — make it more prominent, possibly a month label row above the week numbers)
- **Rotation row headers:** Style as proper labels with the rotation's accent color dot, not just abbreviated text in a box

### 5. Component Strategy
- **New component:** `MonthStackedYear` (or `YearMonthGrid`) — renders 12 `MonthGrid` blocks stacked vertically
- **Reuse:** `MonthDetail` component already exists and works well — adapt its styling for the new color system
- **Shared utility:** Centralize `getRotationAccentColor(index)` returning a new muted palette, replacing the current `getRotationColor` in `calendar-legend.tsx`
- **Admin:** Edit `admin/calendar/page.tsx` cell rendering — no new components needed, just styled cell markup

---

## Scope

### In scope
- `src/components/calendar/year-overview.tsx` — replace with new 12-month stacked layout
- `src/components/calendar/calendar-legend.tsx` — new `getRotationAccentColor` palette
- `src/components/calendar/calendar-cell.tsx` — update to use new color system
- `src/components/calendar/month-detail.tsx` — apply new color system
- `src/app/(authenticated)/admin/calendar/page.tsx` — restyle cells, add accent borders, improve month separators
- `src/app/(authenticated)/calendar/page.tsx` — update toolbar/view switching to accommodate new default view

### Out of scope
- CSS variable token system (Approach 3)
- Drag-and-drop in admin grid
- Animated view transitions
- Print stylesheet
- New data fetching — all existing Convex queries remain unchanged

---

## Open Questions

None — all key decisions resolved in this brainstorm.

---

## Resolved Questions

| Question | Resolution |
|---|---|
| Which surface? | Both (physician calendar + admin grid) |
| Year view layout | 12 months stacked vertically (top-to-bottom scroll) |
| Color direction | Monochrome base + one accent per rotation (left border + dot) |
| Apple Cal features to capture | Soft/muted palette, clear today highlight |
| Admin primary pain point | Looks like Excel — needs to feel like a proper app |
| Approach | Approach 2: New year view + color system |

---

## Success Criteria

- No horizontal scrolling required to see the full year
- A user unfamiliar with the app can immediately identify what rotation they are assigned without reading a legend
- The admin grid looks like a scheduling application, not a spreadsheet
- Today's date is immediately obvious without scanning
- The color palette does not feel garish or high-contrast on either light or dark mode
