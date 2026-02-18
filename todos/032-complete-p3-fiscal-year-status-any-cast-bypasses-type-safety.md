---
status: complete
priority: p3
issue_id: "032"
tags: [code-review, typescript, convex, quality]
dependencies: []
---

# `as any` cast bypasses fiscal-year status type safety

## Problem Statement

`updateFiscalYearStatus` checks active statuses with `ACTIVE_FISCAL_YEAR_STATUSES.includes(args.status as any)`. The `as any` cast bypasses compile-time guarantees and can hide future status drift or refactor errors.

This is not currently breaking behavior, but it is unnecessary type-system erosion in a central workflow mutation.

## Findings

- `convex/functions/fiscalYears.ts:404` uses:
  - `ACTIVE_FISCAL_YEAR_STATUSES.includes(args.status as any)`
- `convex/lib/fiscalYear.ts:6` already exports `ACTIVE_FISCAL_YEAR_STATUSES` as `const`, so a type-safe helper path exists.

## Proposed Solutions

### Option 1: Add a typed predicate helper and remove cast (Recommended)

**Approach:** Export `isActiveFiscalYearStatus(status)` from `convex/lib/fiscalYear.ts` and use it in `updateFiscalYearStatus`.

**Pros:**
- Removes `any`.
- Centralizes status predicate.

**Cons:**
- Small helper addition.

**Effort:** Small

**Risk:** Low

---

### Option 2: Narrow args status type before includes call

**Approach:** Introduce local narrowing function in `fiscalYears.ts` and keep existing constants.

**Pros:**
- Minimal scope.

**Cons:**
- Duplicates logic instead of reusing shared helper.

**Effort:** Small

**Risk:** Low

---

### Option 3: Replace `includes` with explicit switch

**Approach:** Use switch-based guard for active statuses.

**Pros:**
- No casts.
- Explicit control flow.

**Cons:**
- Verbose and easy to drift from shared list.

**Effort:** Small

**Risk:** Medium

## Recommended Action

Use Option 1 and remove `as any` in status checks.

## Technical Details

**Affected files:**
- `convex/functions/fiscalYears.ts`
- `convex/lib/fiscalYear.ts`

**Database changes (if any):**
- No

## Resources

- Workflow policy references:
  - `convex/lib/workflowPolicy.ts`
  - `convex/functions/fiscalYears.ts`

## Acceptance Criteria

- [ ] No `as any` remains in `updateFiscalYearStatus`.
- [ ] Active-status check is type-safe and uses shared helper(s).
- [ ] Typecheck remains green.

## Work Log

### 2026-02-18 - Review discovery

**By:** Codex

**Actions:**
- Ran repository-wide `as any` scan.
- Verified this cast appears in fiscal-year transition logic and is avoidable.

**Learnings:**
- Existing shared status constants are sufficient to remove this cast cleanly.

## Notes

- Classified as P3 because behavior is currently correct but safety is weakened.
