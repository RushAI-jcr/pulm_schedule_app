---
status: pending
priority: p2
issue_id: "019"
tags: [code-review, calendar, timing, ux]
---

# `today` computed once at mount — stale after midnight for long-running sessions

## Problem Statement
Both `YearMonthStack` and `MonthDetail` use `useMemo(() => new Date(), [])` to compute `today`. A physician who leaves the calendar open overnight (e.g., on a second monitor during call) will see yesterday highlighted as "today" — wrong current-week ring, wrong day circle — until they navigate away or refresh. This erodes trust in the scheduling display.

## Findings
- `year-month-stack.tsx` lines 51–55: `today = useMemo(() => ..., [])`
- `month-detail.tsx` lines 52–56: identical pattern
- Both feed `isSameDay(day, today)` and `isCurrentWeek` checks

## Proposed Solutions

### Option A: useToday() hook with midnight auto-refresh (Recommended)
**Effort:** Small | **Risk:** Low
```ts
// src/hooks/use-today.ts
export function useToday(): Date {
  const [today, setToday] = useState(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d
  })
  useEffect(() => {
    const msUntilMidnight = () => {
      const now = new Date()
      const midnight = new Date(now)
      midnight.setHours(24, 0, 0, 0)
      return midnight.getTime() - now.getTime()
    }
    let id: ReturnType<typeof setTimeout>
    const schedule = () => {
      id = setTimeout(() => {
        const d = new Date(); d.setHours(0, 0, 0, 0); setToday(d)
        schedule()
      }, msUntilMidnight())
    }
    schedule()
    return () => clearTimeout(id)
  }, [])
  return today
}
```
Both components call `const today = useToday()` instead of their useMemo.

### Option B: Accept the limitation with a code comment
**Effort:** Trivial | **Risk:** None
Add a comment explaining the known staleness and the fix path. Acceptable if overnight sessions are not a real usage pattern.

## Acceptance Criteria
- [ ] `today` updates at midnight without page reload
- [ ] Both `YearMonthStack` and `MonthDetail` use the shared hook
- [ ] No memory leak (timeout is cleaned up on unmount)

## Work Log
2026-02-17 — Identified by performance-oracle + frontend-races-reviewer agents during code review of `feat/calendar-visual-overhaul`.
