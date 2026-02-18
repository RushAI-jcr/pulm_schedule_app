---
status: complete
priority: p3
issue_id: "038"
tags: [code-review, calendar, ux, accessibility]
dependencies: []
---

# Disable No-Op Outside-Fiscal Week Rows in Year View

Week rows without a backing fiscal `gridRow` are still rendered as interactive buttons in the annual view. They visually suggest navigation but perform no action.

## Problem Statement

In the year stack, boundary rows can represent calendar weeks outside the active fiscal-year dataset. Those rows still render with hover affordance and button semantics but silently no-op on click. This is confusing for users and noisy for keyboard/screen-reader navigation.

## Findings

- In `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/components/calendar/year-month-stack.tsx:134`, each week row is always a `<button>`.
- The click handler gates behavior with `if (weekNumber !== undefined)` (`/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/components/calendar/year-month-stack.tsx:141`), so out-of-scope rows do nothing.
- Label text already detects this case (`"Outside fiscal year"` at `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/components/calendar/year-month-stack.tsx:153`), confirming non-actionable rows are expected.

## Proposed Solutions

### Option 1: Disable button semantics when `weekNumber` is undefined

**Approach:** Keep the row structure but set `disabled`, remove hover class, and add muted cursor style for non-actionable rows.

**Pros:**
- Minimal code churn
- Preserves layout and click-to-month behavior for valid rows

**Cons:**
- Still uses button element for non-interactive content

**Effort:** Small

**Risk:** Low

---

### Option 2: Render conditional element type

**Approach:** Render `<button>` for actionable rows and `<div>` for non-actionable rows.

**Pros:**
- Best semantic correctness
- Clean separation of interactive vs informational rows

**Cons:**
- Slightly more JSX branching

**Effort:** Small

**Risk:** Low

## Recommended Action
Implemented Option 1 in the annual year-view renderer: rows with undefined `weekNumber` are now disabled, lose hover affordance, and use a default cursor while preserving click behavior for actionable weeks.

## Technical Details

**Affected files:**
- `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/components/calendar/year-month-stack.tsx:134`
- `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/components/calendar/year-month-stack.tsx:141`
- `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/components/calendar/year-month-stack.tsx:153`

## Resources

- **Review context:** Annual calendar redesign follow-up

## Acceptance Criteria

- [x] Outside-fiscal rows are not presented as actionable controls
- [x] Hover/click affordances only appear on rows with valid `weekNumber`
- [x] Keyboard navigation only stops on actionable week rows
- [x] No regression in week click-to-month navigation

## Work Log

### 2026-02-18 - Initial Discovery

**By:** Codex

**Actions:**
- Reviewed annual-view row interaction model
- Confirmed non-actionable boundary rows render as active buttons
- Documented semantic and UX impact with file-level evidence

**Learnings:**
- UI already has a correct informational label (`Outside fiscal year`), but interaction state is inconsistent.

### 2026-02-18 - Fix Implemented

**By:** Codex

**Actions:**
- Updated annual week-row rendering to compute `isActionableWeek` and set `disabled={!isActionableWeek}`.
- Removed hover styling from non-actionable rows and applied muted cursor state.
- Preserved existing click-to-month behavior for actionable rows only.
- Validated with `npm test` (pass).

**Learnings:**
- The least invasive accessibility improvement here is gating interaction state directly on `weekNumber` existence.

## Notes

- Non-blocking issue; prioritize after major UX polish items.
