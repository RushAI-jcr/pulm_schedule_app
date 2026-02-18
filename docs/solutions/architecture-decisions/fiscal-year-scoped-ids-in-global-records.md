---
title: "Cross-fiscal-year week ID staleness causes silent constraint drops for mid-year physicians"
date: 2026-02-17
problem_type: architecture_issue
component: physician_record_schema / auto_fill_solver
symptoms:
  - "Physicians with mid-year join or departure dates appear fully active in newly created fiscal years"
  - "activeFromWeekId and activeUntilWeekId constraints silently ignored after fiscal year rollover"
  - "No error or warning emitted when stale week document IDs fail to resolve"
  - "Solver treats affected physicians as unconstrained despite recorded active date ranges"
tags:
  - fiscal_year_rollover
  - document_id_staleness
  - week_scoping
  - iso_date_comparison
  - auto_fill
  - physician_constraints
  - convex_document_ids
related_modules:
  - convex/schema.ts
  - convex/functions/physicians.ts
  - convex/lib/autoFillSolver.ts
  - convex/functions/masterCalendar.ts
related_docs:
  - docs/solutions/feature-implementations/mid-year-physician-management.md
  - docs/solutions/logic-errors/convex-backend-audit-type-safety-and-validators.md
---

# Cross-Fiscal-Year Week ID Staleness

## Problem

Physician records stored `activeFromWeekId: v.optional(v.id("weeks"))` and `activeUntilWeekId: v.optional(v.id("weeks"))`. These are Convex document IDs referencing rows in the `weeks` table, which is partitioned per fiscal year. When FY28 is set up, a fresh batch of week documents is created with new IDs. Physician records from FY27 still held references to FY27 week document IDs.

The auto-fill solver assembled its working `weeks` array exclusively from the current fiscal year being solved. When it executed:

```typescript
const activeFromWeek = weeks.find(w => w._id === physician.activeFromWeekId)
if (activeFromWeek && weekNumber < activeFromWeek.weekNumber) continue
```

…the FY27 week ID was not present in the FY28 weeks array, so the lookup returned `undefined`. The guard `if (activeFromWeek && ...)` silently short-circuited, dropping the activation constraint entirely. The solver proceeded as if the physician had no date restrictions — potentially scheduling them for weeks they were explicitly excluded from — with no error or log entry.

## Root Cause

This is a referential integrity problem in document databases that lack foreign key enforcement: a reference to a row in a scoped sub-table becomes a dangling pointer when the scope changes. The application code treated a missing lookup result as a safe no-op (`if (week && ...)`) rather than an error condition.

**The fundamental mismatch**: `weeks` are scoped to a fiscal year (lifetime = 1 year). `physicians` are global records (lifetime = indefinitely). Storing a scoped ID on a global record creates a temporal dependency that silently breaks when the scope changes.

## Solution

**Replace document ID references with fiscal-year-agnostic ISO 8601 date strings.**

ISO `"YYYY-MM-DD"` strings are:
- Naturally sortable via string comparison (lexicographic order matches chronological order for zero-padded dates)
- Independent of any fiscal year's week documents — no join or lookup required
- Human-readable and displayable without a DB round-trip

### Schema change (`convex/schema.ts`)

```typescript
// Before
activeFromWeekId: v.optional(v.id("weeks")),
activeUntilWeekId: v.optional(v.id("weeks")),

// After
activeFromDate: v.optional(v.string()),  // ISO: physician assignable from this date onward
activeUntilDate: v.optional(v.string()), // ISO: physician assignable until this date
```

### Solver constraint check (`convex/lib/autoFillSolver.ts`)

```typescript
// O(1) lookup pre-computed once per cell (not per physician)
const cellWeekStartDate = weekById.get(cell.weekId)?.startDate

if (cellWeekStartDate) {
  if (physician.activeFromDate && cellWeekStartDate < physician.activeFromDate) continue
  if (physician.activeUntilDate && cellWeekStartDate > physician.activeUntilDate) continue
}
```

`weekById` is a `Map<string, WeekDoc>` built once at the start of `runAutoFill` from the current FY's weeks. The constraint now uses the week's ISO `startDate` for comparison rather than its document ID.

### Mutation API

`deactivatePhysician` now accepts `activeUntilDate: v.string()` directly. `updatePhysician` accepts ISO date strings; empty string `""` signals "clear the restriction":

```typescript
// updatePhysician patch logic
const { activeFromDate, activeUntilDate, ...otherUpdates } = updates
// ...
...(activeFromDate !== undefined ? { activeFromDate: activeFromDate || undefined } : {}),
...(activeUntilDate !== undefined ? { activeUntilDate: activeUntilDate || undefined } : {}),
```

### Cross-field ordering validation

```typescript
const effectiveFrom = activeFromDate !== undefined
  ? (activeFromDate || undefined)
  : existing.activeFromDate
const effectiveUntil = activeUntilDate !== undefined
  ? (activeUntilDate || undefined)
  : existing.activeUntilDate
if (effectiveFrom && effectiveUntil && effectiveFrom >= effectiveUntil) {
  throw new Error("Active start date must be before the active end date")
}
```

### Admin UI

Updated from week ID selects to native `<input type="date">` (ISO string input). `openEditDialog` pre-populates from the physician record so saving without changes doesn't clear existing dates.

## Prevention

### Schema design heuristics for cross-scope references

Before adding a `v.id("weeks")` field to any record, ask: **does the record that holds this ID outlive the scope that owns the referenced record?**

- Physicians are global; weeks are scoped to a fiscal year → **use ISO date**
- Assignments are scoped to a calendar (which belongs to a FY) → **use week ID** (safe — same scope)
- General rule: if table A has a shorter lifetime than table B, then B should never store a raw `v.id("A")` as a durable field without a documented invalidation strategy

### When to use ISO dates vs. document IDs

| Use document ID | Use ISO date string |
|---|---|
| Intra-FY references resolved in same query scope | Constraints that must survive FY boundaries |
| Index-based joins needed (Convex indexes require typed IDs) | Physician hire/termination/contract dates |
| Additional record attributes needed at read time | Any value where "is this before/after X?" is the only question |

**The staleness test**: "If I copy this record into next year's context and dereference this ID, will it return a record from the correct fiscal year?" If the answer is "no" or "maybe," use an ISO date.

### Testing approach

```typescript
// Test: physician with dates from FY27 is correctly handled in FY28 solver
// Setup: physician.activeFromDate = "2026-12-01" (mid-FY27)
// FY28 starts 2027-06-28 — all weeks start AFTER activeFromDate
// Expected: physician is unconstrained in FY28 (all weeks start after their date)
// Asserted: solver does NOT skip this physician for any FY28 week

// Test: physician deactivated mid-FY27 is excluded from FY28
// Setup: physician.activeUntilDate = "2027-02-15" (mid-FY27)
// FY28 starts 2027-06-28 — all weeks start AFTER activeUntilDate
// Expected: physician is excluded from ALL FY28 weeks
// Asserted: solver skips this physician for every FY28 week
```

## Files Changed

| File | Change |
|---|---|
| `convex/schema.ts` | `activeFromWeekId`/`activeUntilWeekId` → `activeFromDate`/`activeUntilDate` |
| `convex/functions/physicians.ts` | All mutations/queries updated; ordering validation added; `deactivatePhysician` accepts ISO date |
| `convex/lib/autoFillSolver.ts` | `PhysicianDoc` interface updated; constraint uses `startDate` string comparison |
| `convex/functions/masterCalendar.ts` | Assignment validation uses `week.startDate` vs. physician dates |
| `src/app/(authenticated)/admin/physicians/page.tsx` | Date inputs instead of week selects; pre-population fixed |
