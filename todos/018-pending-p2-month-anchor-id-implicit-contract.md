---
status: pending
priority: p2
issue_id: "018"
tags: [code-review, calendar, architecture, implicit-coupling]
---

# Month anchor DOM ID format is an implicit string contract with no compile-time verification

## Problem Statement
The string template `` `month-${year}-${month}` `` appears in two separate places: as the rendered element `id` in `year-month-stack.tsx` and inside `scrollToMonth` in `calendar-grid-utils.ts`. These must remain identical. A rename in one without the other silently breaks navigation — no TypeScript error, no lint warning, no test failure.

## Findings
- `year-month-stack.tsx` line 85: `id={`month-${year}-${month}`}`
- `calendar-grid-utils.ts` line 94: `document.getElementById(`month-${year}-${month}`)`
- No shared constant or factory function linking the two

## Proposed Solutions

### Option A: Shared monthAnchorId factory (Recommended)
**Effort:** Trivial | **Risk:** Low
```ts
export function monthAnchorId(year: number, month: number): string {
  return `month-${year}-${month}`
}
```
Used in both `year-month-stack.tsx` (`id={monthAnchorId(year, month)}`) and `scrollToMonth`. Any rename updates one function.

### Option B: Named constant prefix
**Effort:** Trivial | **Risk:** Low
`const MONTH_ANCHOR_PREFIX = "month-"` — less clean, still requires correct concatenation.

## Acceptance Criteria
- [ ] Month anchor ID format defined in exactly one place
- [ ] Both renderer and scroller reference the same function/constant
- [ ] Renaming the format requires changing one location only

## Work Log
2026-02-17 — Identified by architecture-strategist agent during code review of `feat/calendar-visual-overhaul`.
