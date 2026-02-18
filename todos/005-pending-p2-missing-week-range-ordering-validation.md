---
status: complete
priority: p2
issue_id: "005"
tags: [code-review, security, validation, physicians]
dependencies: []
---

# No Validation That activeFromWeekId < activeUntilWeekId

## Problem Statement

`updatePhysician` validates that each week document exists (`ctx.db.get()` returns non-null) but does not verify that `activeFromWeekId.weekNumber < activeUntilWeekId.weekNumber`. An admin can set an inverted range (e.g., `activeFrom = week 40`, `activeUntil = week 5`). The auto-fill solver then checks:

```
weekNumber < activeFromWeek.weekNumber → skip if week < 40
weekNumber > activeUntilWeek.weekNumber → skip if week > 5
```

With an inverted range, **every week** satisfies both conditions simultaneously. The physician is unassignable to any week with no error thrown. The auto-fill solver silently skips the physician; the admin has no indication anything is wrong.

Also: `activeFromWeekId` in `createPhysician` and `updatePhysician` is not validated to belong to a specific fiscal year (unlike `deactivatePhysician` which correctly checks `fiscalYearId`).

## Findings

**Location:** `convex/functions/physicians.ts:436-448`

```typescript
if (updates.activeFromWeekId) {
  const week = await ctx.db.get(updates.activeFromWeekId);
  if (!week) throw new Error("Invalid start week selected");
  // ← no check that weekNumber < activeUntilWeek.weekNumber
}
if (updates.activeUntilWeekId) {
  const week = await ctx.db.get(updates.activeUntilWeekId);
  if (!week) throw new Error("Invalid end week selected");
  // ← no check ordering or fiscal year scope
}
```

## Proposed Solutions

### Option A (Recommended): Cross-field ordering validation + fiscal year scope check

When both IDs are present (incoming or merged with existing record), fetch both weeks and validate:
1. Both belong to the same fiscal year (or a provided `fiscalYearId` arg)
2. `fromWeek.weekNumber < untilWeek.weekNumber`

```typescript
if (fromWeek && untilWeek) {
  if (fromWeek.fiscalYearId !== untilWeek.fiscalYearId) {
    throw new Error("Start and end weeks must be in the same fiscal year");
  }
  if (fromWeek.weekNumber >= untilWeek.weekNumber) {
    throw new Error("Start week must be before end week");
  }
}
```

Note: When only one field is being updated, merge with the persisted value before comparing.

- **Pros:** Prevents corrupted state, clear user-facing error.
- **Effort:** Small (~20 lines including merge logic)
- **Risk:** Low

### Option B: UI-only validation

Add client-side validation in the edit dialog before calling the mutation.

- **Pros:** Immediate feedback.
- **Cons:** Doesn't protect the API surface from direct calls. Not sufficient per CLAUDE.md ("Authorization is always server-side in Convex functions").
- **Effort:** Trivial
- **Risk:** Medium (API remains exploitable)

## Recommended Action

Option A. Server-side validation is required.

## Technical Details

**Affected files:**
- `convex/functions/physicians.ts` — `updatePhysician` handler (merge existing + validate ordering)
- `convex/functions/physicians.ts` — `createPhysician` (validate `activeFromWeekId` belongs to a relevant fiscal year)

## Acceptance Criteria

- [ ] Setting `activeFrom > activeUntil` throws a descriptive error
- [ ] Setting weeks from different fiscal years throws an error
- [ ] Valid ranges (from < until, same FY) still work correctly
- [ ] Error messages are clear enough for an agent to self-correct

## Work Log

- 2026-02-17: Identified by security agent (SEC-01, Medium) and SEC-04 (Low, fiscal year scope check missing).
