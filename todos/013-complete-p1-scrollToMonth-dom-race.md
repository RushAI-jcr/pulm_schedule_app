---
status: complete
priority: p1
issue_id: "013"
tags: [code-review, calendar, frontend-race, dom]
---

# `scrollToMonth` fires synchronously before React commits updated DOM after fiscal year switch

## Problem Statement
When a user switches fiscal year AND then immediately selects a month from the dropdown, `scrollToMonth` fires in the same synchronous tick as the React state update. React has not yet committed the new `YearMonthStack` month anchors to the DOM. `document.getElementById("month-2026-9")` returns `null`. The `?.` swallows it silently — nothing scrolls. User gets no feedback.

## Findings
- `calendar/page.tsx` line 136–147: `scrollToMonth(entry.year, entry.month)` called synchronously immediately after `setActiveMonth(month)`
- `calendar-grid-utils.ts` lines 92–95: `scrollToMonth` uses `document.getElementById` — returns null if DOM not yet committed
- In year view, the `YearMonthStack` is always mounted, so this race only matters immediately after FY switch. In normal usage (no FY switch), the DOM elements already exist when `handleMonthSelect` fires, so this is benign. But the race window is real.

## Proposed Solutions

### Option A: Wrap in `requestAnimationFrame` (Recommended)
**Effort:** Small | **Risk:** Low
```ts
const handleMonthSelect = (month: number, year: number) => {
  setActiveMonth(month)
  if (viewMode === "year") {
    requestAnimationFrame(() => scrollToMonth(year, month))
  } else {
    setViewMode("month")
  }
}
```
Defers scroll until after the browser paint, giving React time to commit. The `?.` in `scrollToMonth` safely handles the case where data is still loading.

### Option B: Use `useEffect` watching `activeMonth`
**Effort:** Medium | **Risk:** Low
Scroll as a side-effect of `activeMonth` changing. More React-idiomatic but requires more wiring.

## Acceptance Criteria
- [ ] `scrollToMonth` deferred to after DOM commit (rAF or effect)
- [ ] No silent no-op when user selects month immediately after FY switch
- [ ] Works correctly when data is loading (graceful no-op)

## Work Log
2026-02-17 — Identified by frontend-races-reviewer agent during code review of `feat/calendar-visual-overhaul`.
