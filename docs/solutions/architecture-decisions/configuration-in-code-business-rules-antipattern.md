---
title: "Hardcoded physician initials and rotation abbreviations in solver rules cause silent breakage on name changes"
date: 2026-02-17
problem_type: architecture_issue
component: auto_fill_solver / consecutive_week_constraints
symptoms:
  - "Consecutive-week constraint overrides silently stop applying when physician initials change"
  - "Consecutive-week constraint overrides silently stop applying when rotation abbreviation changes"
  - "No error emitted when a hardcoded initials or abbreviation string no longer matches any record"
  - "Updating scheduling preferences for a physician or rotation requires a code deployment"
  - "Historical rule intent is not auditable or discoverable from the database"
tags:
  - hardcoded_rules
  - consecutive_week_constraints
  - solver_overrides
  - db_driven_configuration
  - physician_rotation_rules
  - admin_ui
  - silent_failure
  - configuration_in_code
related_modules:
  - convex/schema.ts
  - convex/functions/physicianRotationRules.ts
  - convex/lib/autoFillSolver.ts
  - convex/functions/masterCalendar.ts
  - src/app/(authenticated)/admin/rotations/page.tsx
related_docs:
  - docs/solutions/feature-implementations/auto-fill-constraint-solver.md
  - docs/plans/2026-02-17-feat-smart-calendar-auto-fill-plan.md
---

# Configuration-in-Code: Business Rules Antipattern

## Problem

`convex/lib/physicianConsecutiveWeekRules.ts` contained a static array of plain objects keyed by `physicianInitials` and `rotationAbbreviation` string literals:

```typescript
export const PHYSICIAN_CONSECUTIVE_WEEK_RULES = [
  { physicianInitials: "JG", rotationAbbreviation: "MICU 1", maxConsecutiveWeeks: 2 },
  { physicianInitials: "JG", rotationAbbreviation: "MICU 2", maxConsecutiveWeeks: 2 },
  { physicianInitials: "JG", rotationAbbreviation: "AICU",   maxConsecutiveWeeks: 2 },
  { physicianInitials: "WL", rotationAbbreviation: "ROPH",   maxConsecutiveWeeks: 2 },
  { physicianInitials: "DPG", rotationAbbreviation: "LTAC",  maxConsecutiveWeeks: 2 },
]
```

The solver called `getPhysicianMaxConsecutiveWeeks(physician.initials, rotation.abbreviation, rotation.maxConsecutiveWeeks)` to look up overrides. Both `initials` and `abbreviation` are mutable fields — if either changed, the string comparison silently returned `undefined` and the solver fell back to the rotation's default, with no error or warning.

Three failure modes:

1. **Silent mismatch on rename**: a physician initials change or rotation rename breaks all associated rules invisibly
2. **Code deployment required for any change**: no self-service path for scheduling coordinators to adjust constraints
3. **No fiscal year scoping**: rules applied globally across all years; no way to make year-specific adjustments

## Root Cause

Natural keys (human-readable string identifiers like initials and abbreviations) are mutable. Using them as lookup keys creates a hidden dependency between source code and live database values. When a natural key changes in the DB without a corresponding code change, the lookup silently misses.

**The signs this antipattern has taken hold**:
- Comments like "Based on analysis of FY 2025-2026 actual calendar patterns" — empirically-derived rules belong in the DB, not source
- The constant names specific individuals (`"JG"`, `"WL"`, `"DPG"`) — named-individual rules in source code belong in a DB table keyed by physician IDs
- The code that uses the constant already resolves natural keys to IDs at runtime anyway — if a join is already happening, store the ID

## Solution

**Introduce a `physicianRotationRules` database table keyed by stable document IDs.**

Convex document IDs are immutable — they never change when a record is renamed. Using `physicianId:rotationId` as the composite key makes lookups immune to any field-level edits on either record.

### New schema table (`convex/schema.ts`)

```typescript
physicianRotationRules: defineTable({
  physicianId: v.id("physicians"),
  rotationId:  v.id("rotations"),
  fiscalYearId: v.id("fiscalYears"),
  maxConsecutiveWeeks: v.number(),
})
  .index("by_fiscalYear",             ["fiscalYearId"])
  .index("by_physician_fy",           ["physicianId", "fiscalYearId"])
  .index("by_rotation_fy",            ["rotationId",  "fiscalYearId"])
  .index("by_physician_rotation_fy",  ["physicianId", "rotationId", "fiscalYearId"])
```

`fiscalYearId` scoping allows per-year rules and makes loading a single indexed query.

### Solver interface update (`convex/lib/autoFillSolver.ts`)

```typescript
// New optional parameter — defaults to empty Map, preserving backward compat
interface RunAutoFillParams {
  // ...existing params...
  physicianRotationRulesMap?: Map<string, number>  // key: "physicianId:rotationId"
}

// In runAutoFill:
const physicianRotationRulesMap = params.physicianRotationRulesMap ?? new Map<string, number>()
```

### Constraint check (in `getHardConstraintCandidates`)

```typescript
const maxConsecutive =
  physicianRotationRulesMap.get(`${pid}:${cell.rotationId}`) ??
  rotation.maxConsecutiveWeeks  // fallback to rotation default
```

### Caller-side loading (`convex/functions/masterCalendar.ts`)

```typescript
const physicianRotationRules = await ctx.db
  .query("physicianRotationRules")
  .withIndex("by_fiscalYear", q => q.eq("fiscalYearId", fiscalYearId))
  .collect()

const physicianRotationRulesMap = new Map(
  physicianRotationRules.map(r => [
    `${String(r.physicianId)}:${String(r.rotationId)}`,
    r.maxConsecutiveWeeks,
  ])
)

// Passed to runAutoFill:
runAutoFill({ ..., physicianRotationRulesMap })
```

### Idempotent seed mutation

```typescript
export const seedPhysicianRotationRules = mutation({
  args: { fiscalYearId: v.id("fiscalYears") },
  returns: v.object({ message: v.string(), seeded: v.number() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const knownRules = [
      { initials: "JG",  abbreviation: "MICU 1", maxConsecutiveWeeks: 2 },
      { initials: "JG",  abbreviation: "MICU 2", maxConsecutiveWeeks: 2 },
      { initials: "JG",  abbreviation: "AICU",   maxConsecutiveWeeks: 2 },
      { initials: "WL",  abbreviation: "ROPH",   maxConsecutiveWeeks: 2 },
      { initials: "DPG", abbreviation: "LTAC",   maxConsecutiveWeeks: 2 },
    ]
    let seeded = 0
    for (const rule of knownRules) {
      const physician = await ctx.db.query("physicians")
        .withIndex("by_initials", q => q.eq("initials", rule.initials)).first()
      if (!physician) continue  // skip, don't throw
      const rotation = await ctx.db.query("rotations")
        .withIndex("by_fiscalYear", q => q.eq("fiscalYearId", args.fiscalYearId))
        .filter(q => q.eq(q.field("abbreviation"), rule.abbreviation)).first()
      if (!rotation) continue  // skip, don't throw
      const existing = await ctx.db.query("physicianRotationRules")
        .withIndex("by_physician_rotation_fy", q =>
          q.eq("physicianId", physician._id)
           .eq("rotationId", rotation._id)
           .eq("fiscalYearId", args.fiscalYearId))
        .first()
      if (!existing) {
        await ctx.db.insert("physicianRotationRules", { ...rule fields })
        seeded++
      }
    }
    return { message: `Seeded ${seeded} rules`, seeded }
  },
})
```

### Admin UI

New "Consecutive Week Rules" tab in `/admin/rotations`. Shows all rules for the active fiscal year; supports add, delete, and "Seed defaults" (one-click historical migration).

## Prevention

### Signs configuration-in-code has become a smell

| Signal | Why it's a smell |
|---|---|
| Constant uses string natural keys (`"JG"`, `"MICU 1"`) | Natural keys are mutable; ID mismatch is silent |
| Comment says "based on FY YYYY-YYYY analysis" | Empirical/temporal rules belong in DB |
| Constant names specific people | Named-individual rules → DB table keyed by `physicianId` |
| Code that uses the constant resolves keys to IDs anyway | If you're joining at read time, store the ID |
| Changing a value requires a code deploy | Any operational config that changes more than once/year → DB |
| Two sources of truth (constant + seed mutation) | One truth per fact |

### Migration pattern: hardcoded constants → DB

1. **Schema first**: define table with ID-keyed fields only — no natural key columns
2. **Idempotent seed**: translate old constants to DB records exactly once. Skip (don't throw) on unresolved natural keys. Return a `notFound[]` list
3. **Update consumer**: query DB in the mutation setup phase; pass results as data into the pure solver function
4. **Delete the constant file**: only after seed has run in production
5. **Add admin UI immediately**: without UI, engineers add new hardcoded entries rather than using the DB

### Idempotent seed mutation pattern

```typescript
// Structure every seed mutation this way:
// 1. Resolve natural keys to IDs (skip + log if missing, don't throw)
// 2. Check for existing row before inserting (never overwrite admin-edited values)
// 3. Return summary: { seeded, skipped, notFound: string[] }
// 4. Make callable from admin UI, not just from migration scripts
// 5. Safe to run multiple times — test all three states: empty DB, fully seeded, partial
```

### Test cases

| Test | Assert |
|---|---|
| `seedPhysicianRotationRules` on empty DB | All 5 rules created, `seeded === 5`, `notFound` empty |
| `seedPhysicianRotationRules` on fully-seeded DB | `seeded === 0`, no duplicate rows |
| `seedPhysicianRotationRules` when "JG" initials don't exist | `notFound` contains "JG"; mutation succeeds |
| `upsertPhysicianRotationRule` with `maxConsecutiveWeeks = 0` | Throws validation error |
| Solver with DB rule overriding rotation default | Physician respects DB rule |
| `deletePhysicianRotationRule` then re-run auto-fill | Falls back to rotation-level default |
| CI grep: `PHYSICIAN_CONSECUTIVE_WEEK_RULES` absent from `convex/` | Passes — no regression |

## Files Changed

| File | Change |
|---|---|
| `convex/schema.ts` | Added `physicianRotationRules` table with 4 indexes |
| `convex/functions/physicianRotationRules.ts` | New file: `list`, `upsert`, `delete`, `seed` mutations |
| `convex/lib/physicianConsecutiveWeekRules.ts` | **Deleted** |
| `convex/lib/autoFillSolver.ts` | `physicianRotationRulesMap?: Map<string, number>` param; DB-driven constraint check |
| `convex/functions/masterCalendar.ts` | Loads rules before solver invocation; builds and passes map |
| `src/app/(authenticated)/admin/rotations/page.tsx` | New "Consecutive Week Rules" tab |
