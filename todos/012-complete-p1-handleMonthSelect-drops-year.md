---
status: complete
priority: p1
issue_id: "012"
tags: [code-review, calendar, typescript, architecture]
---

# `handleMonthSelect` silently drops `year` argument — wrong scroll target across fiscal years

## Problem Statement
`CalendarFilters` declares `onMonthSelect: (month: number, year: number) => void` and correctly passes both arguments. But `handleMonthSelect` in `calendar/page.tsx` only accepts `(month: number)` — TypeScript's structural assignability silently swallows the `year` argument. In a fiscal year spanning two calendar years (e.g. Jul 2025–Jun 2026), selecting "January" from the dropdown will ambiguously recover the year via `fiscalMonths.find((m) => m.month === month)`, which returns whichever January appears first. If week boundary overlaps ever produce two January entries, the scroll target will be wrong.

## Findings
- `calendar-filters.tsx` line 40: prop typed as `(month: number, year: number) => void`
- `calendar-filters.tsx` line 118: calls `onMonthSelect(month, year)` — year is passed
- `calendar/page.tsx` line 136: `handleMonthSelect` declared as `(month: number) => void` — year silently dropped
- `calendar/page.tsx` line 142: uses `fiscalMonths.find((m) => m.month === month)` to recover year from state instead of using the already-known year

## Proposed Solutions

### Option A: Accept and forward year (Recommended)
**Effort:** Small | **Risk:** Low
```ts
const handleMonthSelect = (month: number, year: number) => {
  setActiveMonth(month)
  if (viewMode === "year") {
    scrollToMonth(year, month)  // year is already known — no find() needed
  } else {
    setViewMode("month")
  }
}
```
Eliminates the ambiguous `fiscalMonths.find()` lookup. Unambiguous scroll target.

### Option B: Add year to state
**Effort:** Medium | **Risk:** Medium
Change `activeMonth` state from `number` to `{ month: number; year: number }` and thread the year through to `MonthDetail`. More complete fix but touches more files.

## Acceptance Criteria
- [ ] `handleMonthSelect` accepts and uses `year` parameter
- [ ] No `fiscalMonths.find()` needed to recover year in the scroll path
- [ ] TypeScript type of `handleMonthSelect` matches `CalendarFilters` prop declaration

## Work Log
2026-02-17 — Identified by architecture-strategist + frontend-races-reviewer + typescript-reviewer agents during code review of `feat/calendar-visual-overhaul`.
