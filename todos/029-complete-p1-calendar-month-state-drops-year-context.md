---
status: complete
priority: p1
issue_id: "029"
tags: [code-review, calendar, architecture, correctness, known-pattern]
dependencies: []
---

# Calendar month state drops year context and misroutes 53/54-week fiscal years

## Problem Statement

The calendar UI stores only `activeMonth: number` and drops year context in multiple paths. This works only when a fiscal year contains each calendar month once. The project seeds FY 2025-2026 with 54 weeks (including both June 2025 and June 2026), so month-only state becomes ambiguous and can route users to the wrong month.

This is a merge-blocking correctness issue because month jump and previous/next month navigation can render the wrong year-month pair for real seeded data.

## Findings

- `src/app/(authenticated)/calendar/page.tsx:32` stores `activeMonth` as `number` only.
- `src/components/calendar/month-detail.tsx:102` and `src/components/calendar/month-detail.tsx:112` call `onMonthChange(prevEntry.month)` / `onMonthChange(nextEntry.month)`, dropping year.
- `src/components/calendar/calendar-filters.tsx:62` resolves active selection with `find((m) => m.month === activeMonth)`, which is ambiguous when the same month appears twice.
- `convex/functions/resetFY2526Calendar.ts:153` and `convex/functions/resetFY2526Calendar.ts:154` define week 53 and week 54, proving non-12-month-unique grids exist.
- Known pattern reference: `todos/012-complete-p1-handleMonthSelect-drops-year.md` documents the same class of bug and indicates this risk has reappeared in adjacent paths.

## Proposed Solutions

### Option 1: Represent active month as `{ year, month }` end-to-end (Recommended)

**Approach:** Replace `activeMonth: number` with `activePeriod: { year: number; month: number } | null` in `calendar/page.tsx`, `calendar-filters.tsx`, and `month-detail.tsx`. Update callbacks to pass both values.

**Pros:**
- Eliminates ambiguity for 53/54-week fiscal years.
- Aligns all selection/navigation handlers with actual `fiscalMonths` shape.
- Prevents recurrence of month-only bugs.

**Cons:**
- Touches several component props and handlers.
- Requires small refactor and retesting on both views.

**Effort:** Medium

**Risk:** Low

---

### Option 2: Keep month-only state but attach deterministic index

**Approach:** Store an index into `fiscalMonths` instead of month number.

**Pros:**
- Minimal persisted state.
- Naturally handles duplicates by position.

**Cons:**
- Less readable than explicit `{ year, month }`.
- Index invalidation risk if month list derivation changes.

**Effort:** Medium

**Risk:** Medium

---

### Option 3: Guard against duplicate months and fail closed

**Approach:** Detect duplicate month numbers in `fiscalMonths` and disable ambiguous controls with warning text.

**Pros:**
- Quick patch.
- Prevents silently wrong navigation.

**Cons:**
- Functional degradation for valid seeded data.
- Does not solve root modeling issue.

**Effort:** Small

**Risk:** Medium

## Recommended Action

Use Option 1 and migrate all month navigation/select props to `{year, month}` so rendering and controls are deterministic for all fiscal calendars.

## Technical Details

**Affected files:**
- `src/app/(authenticated)/calendar/page.tsx`
- `src/components/calendar/calendar-filters.tsx`
- `src/components/calendar/month-detail.tsx`
- `src/components/calendar/calendar-grid-utils.ts` (helper signatures)

**Related data source proving the edge case:**
- `convex/functions/resetFY2526Calendar.ts` (weeks 53/54)
- `convex/functions/seedRealCalendar.ts` (same 53/54-week shape)

**Database changes (if any):**
- No

## Resources

- Known Pattern: `todos/012-complete-p1-handleMonthSelect-drops-year.md`
- Planning context: `docs/plans/2026-02-17-feat-calendar-visual-overhaul-plan.md`

## Acceptance Criteria

- [ ] Calendar month state includes both `year` and `month` (or equivalent unambiguous identifier).
- [ ] Month jump picks the correct instance when duplicate month names exist in one fiscal year.
- [ ] Previous/next month controls navigate correctly across repeated months.
- [ ] Typecheck, tests, and build stay green.

## Work Log

### 2026-02-18 - Review discovery

**By:** Codex

**Actions:**
- Ran full review evidence (`npm run typecheck`, `npm run test`, `npm run build`).
- Audited calendar month-selection code paths and callback signatures.
- Cross-checked seeded fiscal-year data and found 53/54-week definitions.
- Linked prior completed finding with same failure mode.

**Learnings:**
- The prior fix addressed one entry point, but month-only state still exists in adjacent flows.
- Fiscal-year data shape already contains duplicate calendar months, so this is not theoretical.

## Notes

- This finding should block merge until month navigation is unambiguous for seeded fiscal calendars.
