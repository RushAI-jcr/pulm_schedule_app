---
status: complete
priority: p2
issue_id: "034"
tags: [code-review, calendar, correctness, ui, known-pattern]
dependencies: []
---

# Department month filter drops boundary weeks in week-block matrix

## Problem Statement

The new Department week-block matrix filters rows by `week.startDate` month/year. In month mode, this omits weeks that overlap the selected month but start in the prior month, so staffing for boundary days disappears from the department view.

This is a correctness and UX issue because users reviewing a month can miss week-block assignments that are visible in other calendar views.

## Findings

- `src/components/calendar/department-week-matrix.tsx:46` filters rows with:
  - `start.getMonth() === activePeriod.month && start.getFullYear() === activePeriod.year`
- `src/app/(authenticated)/calendar/page.tsx:266` sends `activePeriod` when Department + Month mode is selected, so this filter is active in normal usage.
- Existing month views (`MonthDetail`) are built via `buildMonthGrid(...)`, which includes boundary weeks that intersect the selected month.
- Repro:
  - Open Department scope.
  - Switch to Month mode and pick a month where week 1 starts in the prior month (e.g., July 2025).
  - The overlapping first week is missing from Department matrix even though it contains days in the selected month.

- Known Pattern:
  - `todos/029-complete-p1-calendar-month-state-drops-year-context.md`
  - `docs/solutions/feature-implementations/calendar-year-view-visual-overhaul.md`

## Proposed Solutions

### Option 1: Intersect-by-day month filtering (Recommended)

**Approach:** Include a week row if `weekStart <= monthEnd && weekEnd >= monthStart` instead of checking only `weekStart` month/year.

**Pros:**
- Matches user expectation for “month includes all days in month”.
- Minimal code change in `DepartmentWeekMatrix`.

**Cons:**
- Week may appear in adjacent month views (same as existing month calendar behavior).

**Effort:** Small

**Risk:** Low

---

### Option 2: Reuse `buildMonthGrid` week membership

**Approach:** Use `buildMonthGrid(activeYear, activeMonth, grid)` and derive the included `weekId`s for Department matrix rows.

**Pros:**
- Guarantees consistency with MonthDetail logic.
- Centralizes month-week semantics.

**Cons:**
- Slightly more refactor and data plumbing.

**Effort:** Medium

**Risk:** Low

---

### Option 3: Clarify strict-start-month behavior in UI copy

**Approach:** Keep current logic but explicitly label month mode as “Weeks starting in this month”.

**Pros:**
- No logic change.

**Cons:**
- Counterintuitive for most scheduling use cases.
- Still inconsistent with MonthDetail behavior.

**Effort:** Small

**Risk:** Medium

## Recommended Action

Option 1 is already implemented in current code: week rows are included by month intersection (`weekStart <= monthEnd && weekEnd >= monthStart`).

## Technical Details

**Affected files:**
- `src/components/calendar/department-week-matrix.tsx`
- `src/app/(authenticated)/calendar/page.tsx`

**Related components:**
- `src/components/calendar/month-detail.tsx`
- `src/components/calendar/calendar-grid-utils.ts`

**Database changes (if any):**
- No

## Resources

- Known pattern todo: `todos/029-complete-p1-calendar-month-state-drops-year-context.md`
- Prior solution doc: `docs/solutions/feature-implementations/calendar-year-view-visual-overhaul.md`

## Acceptance Criteria

- [x] Department Month view includes all weeks that intersect the selected calendar month.
- [x] Boundary weeks (first/last partial weeks) are visible in Department Month view.
- [x] Behavior is documented or aligned with MonthDetail semantics.
- [x] Typecheck/tests pass after fix.

## Work Log

### 2026-02-18 - Review discovery

**By:** Codex

**Actions:**
- Reviewed current calendar scope/view integration and new Department matrix implementation.
- Compared month membership logic in Department matrix vs MonthDetail.
- Confirmed mismatch at boundary-week handling.

**Learnings:**
- Week-block representation needs the same month intersection rules as day-grid month views to avoid staffing gaps.

### 2026-02-18 - Validation + Close

**By:** Codex

**Actions:**
- Verified month filtering logic in `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/components/calendar/department-week-matrix.tsx` already uses intersection semantics with `weekStart`/`weekEnd`.
- Confirmed behavior aligns with month boundary expectations and `MonthDetail` boundary-week model.
- Re-ran full checks (`npm run typecheck`, `npm test`) after adjacent fixes.

**Learnings:**
- This todo reflected an earlier intermediate state; current implementation already satisfies the intended fix.

## Notes

- Protected artifacts policy respected: no cleanup/deletion recommendations for `docs/plans/` or `docs/solutions/`.
