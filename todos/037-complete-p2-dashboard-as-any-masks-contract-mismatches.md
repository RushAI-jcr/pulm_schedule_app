---
status: complete
priority: p2
issue_id: "037"
tags: [code-review, quality, typescript]
dependencies: []
---

# Dashboard `any` Typing Masks Contract Mismatches

Resolved via incremental typed refactor in high-risk dashboard query/mutation paths.

## Problem Statement

The project has generated Convex API types, but `src/features/dashboard/components/App.tsx` previously bypassed them heavily with `any`, increasing runtime drift risk.

## Findings

Historical examples:
- `src/features/dashboard/components/App.tsx:1035`
- `src/features/dashboard/components/App.tsx:1073`
- `src/features/dashboard/components/App.tsx:1285`
- `src/features/dashboard/components/App.tsx:2688`
- `src/features/dashboard/components/App.tsx:3759`
- Baseline had 82 `any` occurrences in this file.
- Current state has 0 `any` occurrences in this file.

Impact (before fix):
- Compile-time contract checks were bypassed in active admin/physician flows.
- Refactors could silently ship incompatible payloads.
- Failures shifted from typecheck to runtime.

Known pattern:
- Similar type-safety gaps previously tracked in `todos/006-complete-p2-reports-return-v-any.md` and `todos/032-complete-p3-fiscal-year-status-any-cast-bypasses-type-safety.md`.

## Proposed Solutions

### Option 1: Replace High-Risk Casts First

Approach: replace `any` for auth, assignment, and trade flows first with concrete DTO types; keep lower-risk legacy regions for a second pass.

Pros:
- Fast risk reduction.
- Incremental delivery.

Cons:
- Leaves partial debt temporarily.

Effort: Medium
Risk: Low-Medium

---

### Option 2: Full Typed Refactor of Legacy Dashboard Module

Approach: replace all broad `any` usage and split large component into typed submodules.

Pros:
- Comprehensive cleanup.
- Better maintainability and testability.

Cons:
- Larger change set.

Effort: Large
Risk: Medium

## Recommended Action

Implemented Option 1 incrementally for high-risk payload paths while preserving behavior and test coverage.

## Technical Details

Affected files:
- `src/features/dashboard/components/App.tsx`

Related components:
- Convex API typing in `convex/_generated/api.d.ts`

Database changes:
- None.

## Resources

- Similar patterns: `todos/006-complete-p2-reports-return-v-any.md`
- Similar patterns: `todos/032-complete-p3-fiscal-year-status-any-cast-bypasses-type-safety.md`

## Acceptance Criteria

- [x] Remove broad `any` typing from critical mutation/query payloads in dashboard module.
- [x] Typecheck fails on invalid payloads without casts.
- [x] Regression tests cover updated typed flows.

## Work Log

### 2026-02-18 - Initial Discovery

By: Codex

Actions:
- Ran codebase scan for `as any` and reviewed high-frequency hotspots.
- Confirmed concentration in legacy dashboard module.

Learnings:
- This is established debt pattern and aligns with prior completed todo themes.

### 2026-02-18 - Workflow Review Refresh

By: Codex

Actions:
- Re-ran focused scan on `src/features/dashboard/components/App.tsx`.
- Confirmed issue persists primarily as explicit `any` annotations rather than only `as any` casts.
- Updated evidence line references to current file state.

Learnings:
- The risk remains the same: Convex contract drift is hidden until runtime.

### 2026-02-18 - Incremental Typed Pass Implemented

By: Codex

Actions:
- Added concrete DTO aliases in `src/features/dashboard/components/App.tsx` for critical clinic/trade/admin payload surfaces.
- Replaced high-risk `any` annotations in the todo’s cited hotspots (clinic assignment maps, cFTE map rows, trade proposal/trade row loops, conference/event filter paths).
- Added typed `SeedButton` mutation reference to avoid broad mutation `any`.
- Re-ran `npm run typecheck` and `npm test` with all checks passing.

Learnings:
- Targeted typing in high-risk mutation/query paths provides substantial safety gains without a full legacy module rewrite.

## Notes

- Prioritize if legacy dashboard routes remain actively used.
