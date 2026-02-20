---
status: complete
priority: p2
issue_id: "041"
tags: [code-review, refactor, architecture, technical-debt, dashboard]
dependencies: []
---

# Decommission Or Isolate Unused Legacy Dashboard Monolith

## Problem Statement

A large legacy dashboard implementation (`src/features/dashboard/components/App.tsx`) remains in the codebase but is no longer routed. It duplicates scheduling/trade/admin logic outside the active page architecture, increasing maintenance cost and divergence risk.

## Findings

- `src/features/dashboard/components/App.tsx:191` exports a full app component with broad feature coverage.
- `src/app/dashboard/page.tsx:4` and `src/app/dashboard/admin/page.tsx:4` now redirect away to routed pages (`/calendar`, `/admin`).
- No active imports were found for this monolith in `src/` (`rg` search returned no references to `@/features/dashboard/components/App`).
- The file still contains alternate trade and admin flows (`src/features/dashboard/components/App.tsx:2755`, `src/features/dashboard/components/App.tsx:3626`), creating parallel implementations.
- Known pattern: previous solved issues repeatedly targeted this same file for type-safety/nullability regressions (`docs/solutions/logic-errors/convex-contract-type-erasure-dashboard-app-20260218.md`, `docs/solutions/logic-errors/dashboard-convex-query-nullability-regression-20260218.md`).

## Proposed Solutions

### Option 1: Remove Monolith After Extracting Needed Shared Logic

**Approach:** Delete `src/features/dashboard/components/App.tsx` after confirming no required logic remains unported.

**Pros:**
- Eliminates major source of drift and duplicate behavior.
- Reduces review/test surface area.
- Clarifies canonical architecture.

**Cons:**
- Requires careful extraction for any still-needed helper code.
- One-time migration audit needed.

**Effort:** Medium

**Risk:** Medium

---

### Option 2: Move To Explicit Legacy Archive Excluded From Build/Typecheck

**Approach:** Relocate file to `legacy/` and exclude it from TypeScript project references.

**Pros:**
- Preserves historical reference.
- Reduces daily compile/review noise.

**Cons:**
- Archive can still rot.
- Requires tsconfig and documentation updates.

**Effort:** Small-Medium

**Risk:** Low-Medium

---

### Option 3: Keep File But Add Hard Guardrails

**Approach:** Keep in place with loud deprecation header and lint rule banning imports.

**Pros:**
- Lowest disruption.
- No immediate migration risk.

**Cons:**
- Technical debt remains.
- Continued risk of accidental edits and divergence.

**Effort:** Small

**Risk:** Medium

## Recommended Action


## Technical Details

**Affected files:**
- `src/features/dashboard/components/App.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/dashboard/admin/page.tsx`
- `tsconfig.json` (if exclusion/archive path adopted)

**Related components:**
- Routed pages in `src/app/(authenticated)/`
- Convex query/mutation consumers duplicated in legacy app

**Database changes (if any):**
- Migration needed? No
- New columns/tables? No

## Resources

- **Legacy monolith:** `src/features/dashboard/components/App.tsx:191`
- **Legacy trade flow in monolith:** `src/features/dashboard/components/App.tsx:2755`
- **Legacy admin trade queue in monolith:** `src/features/dashboard/components/App.tsx:3626`
- **Current route redirect:** `src/app/dashboard/page.tsx:4`
- **Known pattern doc:** `docs/solutions/logic-errors/convex-contract-type-erasure-dashboard-app-20260218.md`
- **Known pattern doc:** `docs/solutions/logic-errors/dashboard-convex-query-nullability-regression-20260218.md`

## Acceptance Criteria

- [ ] Team chooses canonical handling: delete, archive, or hard-deprecate monolith.
- [ ] No active feature logic exists in un-routed legacy component.
- [ ] Trade/admin flows have a single source of truth in routed architecture.
- [ ] Typecheck/test/build remain green after cleanup.

## Work Log

### 2026-02-19 - Refactor/cleanup review finding

**By:** Codex

**Actions:**
- Checked routed entry points and confirmed dashboard routes redirect.
- Searched for imports and found no active usage of legacy monolith.
- Inspected monolith sections containing duplicate trade/admin functionality.
- Cross-referenced existing solved docs showing repeated regression history in this file.

**Learnings:**
- This file is a recurring risk hotspot and a strong cleanup candidate before broader beta hardening.

## Notes

- Classed P2 because this is not an immediate runtime break, but it materially increases maintenance and regression risk.
