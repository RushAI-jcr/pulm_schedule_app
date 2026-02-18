---
status: done
priority: p1
issue_id: "002"
tags: [code-review, architecture, auto-fill, physicians, configuration]
dependencies: []
---

# Hardcoded Physician Consecutive Week Rules in Code

## Problem Statement

`convex/lib/physicianConsecutiveWeekRules.ts` encodes physician-specific scheduling preferences (max consecutive weeks per rotation) as a hardcoded constant in application code, using mutable natural keys (physician initials and rotation abbreviations). This means:

1. **Any change to a rule requires a code deployment** — a scheduling preference change is operational data, not code.
2. **Initials are mutable**: `updatePhysician` allows changing initials. If JG's initials change, the rule for `"JG"` silently becomes a dead reference.
3. **Rotation abbreviations are mutable**: An admin can rename a rotation. `"MICU 1"` in the rule won't match the renamed rotation.
4. **Rules feed into a hard constraint** in the solver — a stale rule silently prevents valid assignments, with no diagnostic output.

## Findings

**Location:** `convex/lib/physicianConsecutiveWeekRules.ts`

```typescript
export const PHYSICIAN_CONSECUTIVE_WEEK_RULES: PhysicianConsecutiveRule[] = [
  { physicianInitials: "JG", rotationAbbreviation: "MICU 1", maxConsecutiveWeeks: 2 },
  { physicianInitials: "JG", rotationAbbreviation: "MICU 2", maxConsecutiveWeeks: 2 },
  { physicianInitials: "JG", rotationAbbreviation: "AICU", maxConsecutiveWeeks: 2 },
  { physicianInitials: "WL", rotationAbbreviation: "ROPH", maxConsecutiveWeeks: 2 },
  { physicianInitials: "DPG", rotationAbbreviation: "LTAC", maxConsecutiveWeeks: 2 },
];
```

Used in solver at `convex/lib/autoFillSolver.ts:545-555` as a **hard constraint** that eliminates physician candidates.

## Proposed Solutions

### Option A (Recommended): Store physician-rotation overrides in the database

Add a new `physicianRotationRules` table:
```typescript
physicianRotationRules: defineTable({
  physicianId: v.id("physicians"),
  rotationId: v.id("rotations"),
  fiscalYearId: v.id("fiscalYears"),
  maxConsecutiveWeeks: v.number(),
}).index("by_physician_fy", ["physicianId", "fiscalYearId"])
  .index("by_rotation_fy", ["rotationId", "fiscalYearId"])
```

Load rules in `autoAssignCurrentFiscalYearDraft` action alongside other data, pass as a `Map<string, number>` keyed by `physicianId:rotationId`. Delete `physicianConsecutiveWeekRules.ts`.

- **Pros:** Referential integrity, admin-editable without deployment, fiscal-year scoped, auditable.
- **Cons:** Schema migration, new admin UI needed.
- **Effort:** Large (~2-3 hours)
- **Risk:** Low (additive change)

### Option B: Short-term — Use physician IDs and rotation IDs as keys (keep in code temporarily)

Replace the initials/abbreviation strings with actual Convex document IDs. This is fragile but removes the mutable natural key problem. Still requires a deployment for changes.

- **Pros:** Quick, eliminates silent stale-key problem.
- **Cons:** IDs are environment-specific (prod vs dev), still requires deployment.
- **Effort:** Small (~30 min)
- **Risk:** Medium (IDs differ between environments)

### Option C: Hybrid — Keep in code, add integration test that validates all initials/abbreviations exist in DB

Add a Vitest test that seeds the DB and confirms every entry in `PHYSICIAN_CONSECUTIVE_WEEK_RULES` matches a real physician initials and rotation abbreviation. At least fails loudly if data diverges.

- **Pros:** Minimal change, catches stale references at test time.
- **Cons:** Still requires code deploy for rule changes.
- **Effort:** Small
- **Risk:** Low

## Recommended Action

Option A for the next fiscal year setup. Option C as an interim safety net.

## Technical Details

**Affected files:**
- `convex/schema.ts` — add `physicianRotationRules` table
- `convex/lib/physicianConsecutiveWeekRules.ts` — delete
- `convex/lib/autoFillSolver.ts` — consume map instead of static function
- `convex/functions/masterCalendar.ts` — load rules in `autoAssignCurrentFiscalYearDraft`
- New admin UI for managing these rules

## Acceptance Criteria

- [ ] No physician initials or rotation abbreviation strings hardcoded in application logic
- [ ] Admin can modify a physician's consecutive week preference without a deployment
- [ ] Solver uses DB-loaded rules, falls back to rotation default when no override exists
- [ ] `physicianConsecutiveWeekRules.ts` deleted
- [ ] TypeScript clean

## Work Log

- 2026-02-17: Identified by architecture agent (Concern 1, HIGH severity) and code simplicity agent. Core issue: configuration encoded as code.
