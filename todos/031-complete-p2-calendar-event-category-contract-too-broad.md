---
status: complete
priority: p2
issue_id: "031"
tags: [code-review, schema, types, convex, calendar]
dependencies: []
---

# Published calendar event category contract is widened to string

## Problem Statement

The `calendarEvents` schema defines a strict category union, but `getPublishedCalendarByFiscalYear` returns event `category` as `v.string()`. Frontend calendar components use a narrower `EventCategory` union. This contract widening weakens type safety and can hide invalid event categories until runtime rendering.

## Findings

- Schema is strict union:
  - `convex/schema.ts` (`calendarEvents.category` union of `federal_holiday | religious_observance | cultural_observance | conference | other`)
- Query return is widened:
  - `convex/functions/masterCalendar.ts:934` onward, `events` return validator uses `category: v.string()`
- Frontend expects strict union:
  - `src/components/calendar/calendar-grid-utils.ts:12` defines `EventCategory` union
  - `src/components/calendar/year-month-stack.tsx` and `src/components/calendar/month-detail.tsx` branch styling on known categories

## Proposed Solutions

### Option 1: Make Convex return validator match schema union (Recommended)

**Approach:** Replace `v.string()` with the same union literals used by schema for event categories.

**Pros:**
- End-to-end type contract consistency.
- Invalid categories fail earlier.

**Cons:**
- Requires touching generated type surface after function update.

**Effort:** Small

**Risk:** Low

---

### Option 2: Keep backend broad and harden frontend with runtime narrowing

**Approach:** Add runtime parser in frontend to map unknown categories to `other`.

**Pros:**
- Defensive against legacy/dirty data.
- Can be done client-side only.

**Cons:**
- Leaves backend contract weak.
- Duplicates validation logic.

**Effort:** Small

**Risk:** Medium

---

### Option 3: Shared category constant module used by schema + functions + UI

**Approach:** Create one source of truth for event categories and consume everywhere.

**Pros:**
- Prevents future divergence.
- Improves maintainability.

**Cons:**
- Slightly broader refactor.

**Effort:** Medium

**Risk:** Low

## Recommended Action

Apply Option 1 now; optionally follow with Option 3 to prevent drift.

## Technical Details

**Affected files:**
- `convex/functions/masterCalendar.ts`
- `convex/schema.ts`
- `src/components/calendar/calendar-grid-utils.ts`

**Database changes (if any):**
- No

## Resources

- Calendar visual overhaul context: `docs/plans/2026-02-17-feat-calendar-visual-overhaul-plan.md`
- Known Pattern: `todos/027-complete-p3-rotation-category-union-types.md`

## Acceptance Criteria

- [ ] `getPublishedCalendarByFiscalYear` event return validator uses strict category union.
- [ ] Frontend event type matches backend return contract without widening.
- [ ] Typecheck remains green.

## Work Log

### 2026-02-18 - Review discovery

**By:** Codex

**Actions:**
- Cross-checked schema event union with query return validators.
- Cross-checked frontend event category union usage in calendar rendering components.
- Confirmed contract widening in Convex function return shape.

**Learnings:**
- The schema is already strict; only function return typing drifted.

## Notes

- This is a schema/interface integrity issue, not a runtime DB migration.
