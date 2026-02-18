---
status: done
priority: p1
issue_id: "003"
tags: [code-review, architecture, schema, physicians, auto-fill]
dependencies: []
---

# activeFromWeekId / activeUntilWeekId Go Stale Across Fiscal Years

## Problem Statement

`physicians.activeFromWeekId` and `physicians.activeUntilWeekId` store Convex IDs that reference fiscal-year-scoped `weeks` documents. The physician record is **global** (persists across fiscal years), but the week documents belong to a specific fiscal year. This creates a cross-boundary reference that silently breaks when a new fiscal year is set up.

**Concrete failure mode:** A physician joins mid-year in FY27. `activeFromWeekId` is set to the FY27 Week 14 document. When FY28 is set up with new week documents, the physician's record still points to the FY27 Week 14 document ID. The FY28 auto-fill solver receives `weeks[]` containing only FY28 weeks. The constraint check:

```typescript
const activeFromWeek = weeks.find((w) => w._id === physician.activeFromWeekId);
if (activeFromWeek && weekNumber < activeFromWeek.weekNumber) continue;
```

`weeks.find()` returns `undefined` because the FY27 week ID is not in the FY28 array. The `if (activeFromWeek && ...)` short-circuits — **the constraint silently disappears**. The physician is treated as fully active for all of FY28 with no error.

Same issue in `listPhysiciansWithStatus`: the week number map is built from the queried fiscal year's weeks, so `activeFromWeekNumber` resolves to `undefined` — the admin sees no active date range even though one was set.

## Findings

**Schema:** `convex/schema.ts:30-31`
```typescript
activeFromWeekId: v.optional(v.id("weeks")),
activeUntilWeekId: v.optional(v.id("weeks")),
```

**Solver:** `convex/lib/autoFillSolver.ts:518-525` — constraint silently drops if week ID not in current-FY weeks array.

**listPhysiciansWithStatus:** `convex/functions/physicians.ts:644-645` — week numbers resolve to `undefined` for cross-year IDs.

## Proposed Solutions

### Option A (Recommended): Store ISO date strings instead of week IDs

Change the schema to store the effective date rather than a week document reference:
```typescript
activeFromDate: v.optional(v.string()),  // ISO "2026-09-29"
activeUntilDate: v.optional(v.string()), // ISO "2027-01-05"
```

The solver's constraint check becomes:
```typescript
if (physician.activeFromDate && week.startDate < physician.activeFromDate) continue;
if (physician.activeUntilDate && week.endDate > physician.activeUntilDate) continue;
```

Every `WeekDoc` already has `startDate` and `endDate`. ISO date strings are fiscal-year-agnostic, human-readable, and never go stale. `listPhysiciansWithStatus` can resolve the date to a week number by matching against the queried fiscal year's weeks.

- **Pros:** Eliminates the staleness problem at the root. No migration headaches for new FY.
- **Cons:** Schema migration needed (data migration for existing `activeFromWeekId` values).
- **Effort:** Medium (~2 hours)
- **Risk:** Low — additive field change, old IDs can be migrated via a one-time script

### Option B: Scope the activation record to fiscal year (join table)

Create a `physicianActivation` table:
```typescript
physicianActivation: defineTable({
  physicianId: v.id("physicians"),
  fiscalYearId: v.id("fiscalYears"),
  activeFromWeekId: v.optional(v.id("weeks")),
  activeUntilWeekId: v.optional(v.id("weeks")),
}).index("by_physician_fy", ["physicianId", "fiscalYearId"])
```

Physician record has no week fields. Each FY has its own activation record.

- **Pros:** Proper relational scoping, preserves week-ID references, enables per-FY history.
- **Cons:** More complex schema and query patterns.
- **Effort:** Large
- **Risk:** Medium (larger refactor)

## Recommended Action

Option A — ISO date strings are the natural representation for "this physician joined on a specific date."

## Technical Details

**Affected files:**
- `convex/schema.ts:30-31` — change field types
- `convex/functions/physicians.ts` — `deactivatePhysician`, `updatePhysician`, `createPhysician`, `listPhysiciansWithStatus`
- `convex/lib/autoFillSolver.ts:518-525` — update constraint check
- `convex/lib/autoFillSolver.ts:63-70` — update `PhysicianDoc` interface
- `src/app/(authenticated)/admin/physicians/page.tsx` — date picker instead of week ID select

## Acceptance Criteria

- [ ] Physician active date constraints survive fiscal year rollover without manual intervention
- [ ] Auto-fill solver enforces constraints correctly for FY+1 without any data changes
- [ ] `listPhysiciansWithStatus` correctly displays active date info for any queried fiscal year
- [ ] Schema migration migrates existing week ID values to ISO dates
- [ ] TypeScript clean on both tsconfigs

## Work Log

- 2026-02-17: Identified by architecture agent (Concern 5, HIGH severity). Critical because the silent constraint drop is invisible — no error, no warning.
