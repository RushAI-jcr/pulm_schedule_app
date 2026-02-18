---
status: pending
priority: p2
issue_id: "022"
tags: [code-review, calendar, performance]
---

# `buildMonthGrid` called 12× per render inline in JSX — should be memoized

## Problem Statement
`year-month-stack.tsx` calls `buildMonthGrid(year, month, grid)` for each of the 12 fiscal months inline inside `fiscalMonths.map()` in JSX. `buildMonthGrid` scans the 52-row grid with `grid.find()` per week. This runs on every re-render of `YearMonthStack` — including filter changes, scope toggles, and Convex subscription ticks — even when `grid` has not changed. `MonthDetail` correctly wraps its single call in `useMemo`.

## Findings
- `year-month-stack.tsx` line 81: `buildMonthGrid` called inline in JSX map, not memoized
- `month-detail.tsx` lines 63–66: same function correctly in `useMemo([activeYear, activeMonth, grid])`
- Each call performs O(52) `string.find()` per week row (up to 6 per month)

## Proposed Solutions

### Option A: Hoist into useMemo (Recommended)
**Effort:** Small | **Risk:** Low
```ts
const monthGrids = useMemo(
  () => fiscalMonths.map(({ month, year }) => ({
    month, year, calendarWeeks: buildMonthGrid(year, month, grid),
  })),
  [fiscalMonths, grid]
)
```
Iterate `monthGrids` in JSX instead. Zero recomputation when `grid` is stable.

### Option B: Pre-index grid by startDate
**Effort:** Small | **Risk:** Low
Build `Map<startDate, GridRow>` once and pass to `buildMonthGrid` for O(1) per-week lookups instead of O(52) `find()`. Complementary to Option A.

## Acceptance Criteria
- [ ] `buildMonthGrid` not called on re-renders where `grid` and `fiscalMonths` are stable
- [ ] All 12 months still render correctly
- [ ] Dep array `[fiscalMonths, grid]` is correct and minimal

## Work Log
2026-02-17 — Identified by performance-oracle + frontend-races-reviewer agents.
