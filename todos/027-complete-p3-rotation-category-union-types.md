---
status: complete
priority: p3
issue_id: "027"
tags: [code-review, calendar, typescript, type-safety]
---

# `CalendarEvent.category` typed as `string` — should be a discriminated union

## Problem Statement
`CalendarEvent.category` is typed as `string` but consumed in ternary chains comparing against string literals `"federal_holiday"`, `"conference"`, etc. A union type would catch typos at compile time, document all valid values, and make the `else` branch behavior explicit.

## Findings
- `year-month-stack.tsx` line 26: `category: string`
- `month-detail.tsx` line 28: `category: string`
- Both files have ternary chains: `e.category === "federal_holiday" ? ... : e.category === "conference" ? ... : ...`
- If a new category is added to the backend, components silently fall through to the `else` branch

## Proposed Solutions

### Option A: Union type in shared CalendarEvent (Recommended)
**Effort:** Trivial | **Risk:** Low
```ts
// In calendar-grid-utils.ts (or wherever CalendarEvent is shared)
export type EventCategory = "federal_holiday" | "conference" | "religious_observance" | "other"
export type CalendarEvent = {
  weekId: Id<"weeks">; date: string; name: string; category: EventCategory
}
```

## Acceptance Criteria
- [ ] `CalendarEvent.category` is a union literal type
- [ ] TypeScript flags unknown category strings at compile time
- [ ] Defined in the shared location (alongside other shared types)

## Work Log
2026-02-17 — Identified by typescript-reviewer agent.
