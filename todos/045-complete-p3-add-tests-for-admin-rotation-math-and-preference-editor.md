---
status: complete
priority: p3
issue_id: "045"
tags: [code-review, testing, quality, admin, rotations, preferences]
dependencies: []
---

# Add Regression Tests For New Admin Rotation/Preference Flows

## Problem Statement

New admin capabilities were added for per-year rotation math edits and admin-driven preference updates, but there is currently no targeted test coverage for these paths. This increases regression risk for input validation, state transitions, and policy alignment.

## Findings

- New mutation introduced without direct test coverage:
  - `convex/functions/rotations.ts:130` (`updateRotationSettings`)
- New admin preference editor wiring introduced without direct route-level coverage:
  - `src/app/(authenticated)/admin/requests/page.tsx:173`
- Repository test search found no tests for these new entry points:
  - `rg -n "updateRotationSettings|setPhysicianRotationPreferenceByAdmin" tests` returned no matches.

## Proposed Solutions

### Option 1: Add focused unit tests for mutation validation/policy

**Approach:** Add tests for valid/invalid inputs and fiscal-year scoping on `updateRotationSettings`; add tests for admin preference mode payload mapping.

**Pros:**
- Fastest way to lock backend contract.
- Captures edge-case validation behavior.

**Cons:**
- Does not validate UI interactions end to end.

**Effort:** Small-Medium

**Risk:** Low

---

### Option 2: Add integration tests for admin route workflows

**Approach:** Add route/component tests for `/admin/rotations` edit dialog and `/admin/requests` preference editor interactions.

**Pros:**
- Verifies user-visible behavior.
- Catches wiring regressions.

**Cons:**
- More setup and maintenance than unit tests.

**Effort:** Medium

**Risk:** Low-Medium

## Recommended Action

Implemented Option 1: added focused unit tests for rotation settings validation and admin preference payload mapping, and wired production code to these tested helpers.

## Technical Details

**Affected files:**
- `convex/functions/rotations.ts`
- `src/app/(authenticated)/admin/rotations/page.tsx`
- `src/app/(authenticated)/admin/requests/page.tsx`
- `tests/*`

**Database changes (if any):**
- Migration needed? No
- New columns/tables? No

## Resources

- `convex/functions/rotations.ts:130`
- `src/app/(authenticated)/admin/requests/page.tsx:173`

## Acceptance Criteria

- [x] Tests cover `updateRotationSettings` input validation and fiscal-year ownership checks.
- [x] Tests cover admin preference save payload behavior for all modes (`preferred`, `willing`, `deprioritize`, `do_not_assign`).
- [x] CI fails on regressions in these new admin flows.

## Work Log

### 2026-02-19 - Review Finding

**By:** Codex

**Actions:**
- Reviewed new admin feature paths and searched test suite for direct coverage.
- Confirmed no focused tests exist for newly introduced mutation/editor paths.

**Learnings:**
- Existing broad checks pass, but targeted regression safety for new admin flows is missing.

### 2026-02-19 - Resolution

**By:** Codex

**Actions:**
- Added `tests/rotationSettingsValidation.test.ts` for cFTE/min staff/max-week validation and fiscal-year ownership checks.
- Added `tests/adminRotationPreferencePayload.test.ts` for admin preference mode payload mapping coverage.
- Introduced helper modules `convex/lib/rotationSettings.ts` and `src/lib/adminRotationPreference.ts` and wired callers.
- Re-ran full verification (`npm run check`).

**Learnings:**
- Extracting pure helper logic yields stable, fast tests for admin workflow rules without heavy UI harness overhead.

## Notes

- Nice-to-have hardening item; does not block release by itself.
