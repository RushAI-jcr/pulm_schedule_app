---
title: "feat: Preferences Wizard Week-Import Parity (Physician + Admin)"
type: feat
date: 2026-02-19
brainstorm: docs/brainstorms/2026-02-19-preferences-wizard-week-import-parity-brainstorm.md
---

# Preferences Wizard Week-Import Parity (Physician + Admin)

## Overview

Add the existing CSV/XLSX week-preference import behavior to `/preferences` so both physicians and admins can import week preferences from the wizard-era UI, using the same parsing and backend mutation rules already in production (`importWeekPreferencesFromUpload`).

**Brainstorm:** [docs/brainstorms/2026-02-19-preferences-wizard-week-import-parity-brainstorm.md](../brainstorms/2026-02-19-preferences-wizard-week-import-parity-brainstorm.md)

## Problem Statement / Motivation

The codebase currently has a split state:

1. `/preferences` is the active physician workflow but has no upload import UI (`src/app/(authenticated)/preferences/page.tsx:19`).
2. Import UX exists only in legacy dashboard code (`src/features/dashboard/components/App.tsx:2138`, `src/features/dashboard/components/App.tsx:3354`), while modern dashboard routes already redirect (`src/app/dashboard/page.tsx:4`, `src/app/dashboard/admin/page.tsx:4`).
3. `/preferences` currently assumes physician-linked context by calling physician-only queries (`getMyScheduleRequest`, `getMyRotationPreferences`), which break for admin users without physician linkage because these queries rely on `getCurrentPhysician` (`convex/functions/scheduleRequests.ts`, `convex/functions/rotationPreferences.ts:129`, `convex/lib/auth.ts:77`).

Result: the import feature exists, but not in the canonical workflow and not safely available for all requested roles.

## Research Summary

### Repository Findings

- Backend import contract is already robust and should remain source of truth:
  - `convex/functions/scheduleRequests.ts:403` (`importWeekPreferencesFromUpload`)
  - Enforces FY match, doctor-token match, week coverage, duplicates/unknowns, and collecting-window constraints.
- Frontend parser and metadata extraction are already implemented and tested:
  - `src/shared/services/scheduleImport.ts:57`, `src/shared/services/scheduleImport.ts:415`, `src/shared/services/scheduleImport.ts:450`
  - `tests/scheduleImportParser.test.ts:10`, `tests/scheduleImportValidation.test.ts:9`
- Legacy UI already contains the behavior and preflight validation we want to preserve:
  - `src/features/dashboard/components/App.tsx:181` (`validateParsedUpload`)
  - Physician self-import panel: `src/features/dashboard/components/App.tsx:2556`
  - Admin on-behalf panel: `src/features/dashboard/components/App.tsx:3354`
- Current `/preferences` wizard has no import section and currently initializes week local state once:
  - `src/components/wizard/week-availability-step.tsx:65`

### Institutional Learnings

- Relevant learning: `docs/solutions/logic-errors/dashboard-convex-query-nullability-regression-20260218.md`
  - Key insight: keep Convex query union handling explicit (`undefined` loading, nullable payloads), avoid narrowing assumptions that cause type regressions.
  - This directly applies to role-based branching in `/preferences`.

### Documentation / Policy Constraints

- Authorization model requires server-side enforcement and object-level checks:
  - `docs/architecture/authorization-matrix.md:36`
  - `docs/architecture/authorization-test-cases.md:7`
- Middleware role gate allows admin access to physician-scoped routes because role hierarchy is rank-based:
  - `/preferences` requires `physician`: `src/middleware.ts:50`
  - Admin rank satisfies physician routes: `src/middleware.ts:38`

### External Research Decision

Skipped. This feature is internal parity work with strong existing local patterns and no new external integration risk.

## SpecFlow Analysis

### User Flow Overview

1. Physician (linked) imports own file in `/preferences`, sees parse summary, validates, imports, and week grid reflects new state.
2. Admin (linked physician) uses `/preferences`, selects a target physician, imports file on their behalf.
3. Admin (not linked to physician) opens `/preferences` and still gets an import-only experience (no physician-only queries).
4. Any user attempts import outside collecting window and receives locked state feedback (no mutation attempt).
5. Any user uploads invalid file (FY mismatch, doctor mismatch, missing/unknown/duplicate week_start) and is blocked client-side before submit; backend remains final guard.

### Flow Permutations Matrix

| Role / linkage | FY status | UI mode | Expected outcome |
|---|---|---|---|
| Physician linked | collecting | Wizard + self import | Can import own file and continue editing/submitting |
| Physician linked | non-collecting | Read-only wizard | Import controls disabled/hidden |
| Admin linked | collecting | Wizard + admin import controls | Can choose physician and import on behalf |
| Admin unlinked | collecting | Import-only panel | Can choose physician and import; no physician-only query failures |
| Admin any | non-collecting | Read-only/locked | Import blocked with status message |

### Gaps Identified and Plan Responses

- **Critical:** Admin-unlinked path currently breaks due physician-only queries.
  - Response: split `/preferences` into role-aware subviews so unlinked admins never call physician-only queries.
- **Important:** Imported data may not visibly refresh in Week Availability step because local map state is initialized once.
  - Response: synchronize local state from `weekPreferences` prop updates after import.
- **Important:** Validation logic is duplicated in legacy component only.
  - Response: extract shared preflight validation helper for wizard usage.

## Proposed Solution

### Architecture

1. Keep backend import mutation unchanged.
2. Reuse existing parser (`parseScheduleImportFile`) and validation semantics.
3. Add a reusable wizard-native import panel component.
4. Add role-aware rendering in `/preferences` to support:
   - physician self-import,
   - admin import-on-behalf,
   - admin unlinked import-only mode.
5. Treat legacy dashboard import panels as deprecated entry points; parity ships in `/preferences`, then remove legacy panel code after validation window.

## Technical Considerations

- **Authorization:** No client-only trust. Client preflight is UX only; backend remains final validator (`convex/functions/scheduleRequests.ts:403`).
- **Type safety:** Avoid dashboard nullability regression pattern by preserving explicit loading/nullable branches.
- **State sync:** Week step local state must reconcile with server-updated week preferences after successful import.
- **No schema changes:** This is a UI/integration parity feature.

## Implementation Plan

### Phase 1: Extract Shared Import Validation and Types

- [x] Create `src/shared/services/scheduleImportValidation.ts`
  - Move/port `validateParsedUpload` semantics from `src/features/dashboard/components/App.tsx:181`.
  - Export reusable types for target physician and fiscal week-lite inputs.
- [x] Add tests for shared validation helper:
  - `tests/scheduleImportClientValidation.test.ts`
  - Cover FY mismatch, doctor mismatch, missing/unknown weeks, exact-week-count mismatch.

### Phase 2: Build Wizard Import Panel Component

- [x] Add `src/components/wizard/week-import-panel.tsx`
  - Parse file via `parseScheduleImportFile` (`src/shared/services/scheduleImport.ts:450`).
  - Show parsed metadata + counts + validation status.
  - Call `api.functions.scheduleRequests.importWeekPreferencesFromUpload`.
  - Support two modes:
    - self mode (no physician selector)
    - admin mode (physician selector required)
- [x] Add props/callbacks for status integration with wizard save UI.

### Phase 3: Integrate Into Week Availability Wizard Step

- [x] Update `src/components/wizard/week-availability-step.tsx`
  - Render import panel at top of step when enabled.
  - Add optional props:
    - `importMode`
    - `importTargetOptions`
    - `defaultImportTargetId`
- [x] Fix post-import state visibility:
  - Add effect to resync `localPrefs` when `weekPreferences` prop changes.

### Phase 4: Role-Aware Preferences Page Refactor

- [x] Refactor `src/app/(authenticated)/preferences/page.tsx` into role-safe branches/subcomponents:
  - Physician experience (existing wizard behavior + import panel).
  - Admin linked experience (wizard + admin import-on-behalf controls).
  - Admin unlinked experience (import-only panel; no physician-only queries).
- [x] Add physicians query for admin target selection:
  - `api.functions.physicians.getPhysicians` (`convex/functions/physicians.ts:326`), filtered to active.
- [x] Preserve existing read-only behavior by fiscal year status.

### Phase 5: Legacy Dashboard Entry Point Deprecation

- [x] Mark legacy import panels in `src/features/dashboard/components/App.tsx` as deprecated in-code (comment + pointer to `/preferences`).
- [ ] After validation window, remove:
  - Physician import block (`src/features/dashboard/components/App.tsx:2556`)
  - Admin import panel (`src/features/dashboard/components/App.tsx:3354`)
  - Local-only helper duplicates if fully replaced.

## Acceptance Criteria

- [x] `/preferences` step 1 includes import controls for physician self-import.
- [x] `/preferences` supports admin import-on-behalf with physician selection.
- [x] Admin without physician linkage can still import from `/preferences` without runtime query errors.
- [x] Client preflight blocks obvious invalid uploads (FY, doctor token, week coverage/count).
- [x] Backend mutation remains authoritative and unchanged for validation/authorization.
- [x] After successful import, week availability UI reflects imported values immediately.
- [x] Import controls are locked when FY status is not `collecting`.
- [ ] Legacy dashboard import entry points are deprecated (phase 1) and removed after validation (phase 2).
- [x] `npm run lint` passes.
- [x] `npm run test` passes (including new validation tests).

## Success Metrics

- Single canonical user-visible import path in `/preferences`.
- Zero regressions in existing parser/mutation behavior.
- No support tickets about role-based inability to import (especially admin-unlinked scenario).

## Dependencies & Risks

### Dependencies

- Existing Convex auth/linkage behavior (`convex/lib/auth.ts`) and role resolution.
- Existing parser service and import mutation contracts.

### Risks

- **Risk:** Breaking hook ordering/loading branches in `/preferences` during role refactor.
  - **Mitigation:** split into subcomponents with stable hook trees.
- **Risk:** UI state not refreshing after import due local state cache.
  - **Mitigation:** explicit prop-to-local synchronization effect.
- **Risk:** Drift between old and new validation messages.
  - **Mitigation:** one shared validation helper consumed by wizard path.

## Out of Scope

- Changing file naming conventions or accepted upload formats.
- Altering backend import rules (FY matching, doctor-token matching, week completeness).
- Bulk multi-physician file ingestion in one upload.

## Verification Plan

1. `npm run lint`
2. `npm run test`
3. Manual scenarios:
   - Physician linked + valid import
   - Physician linked + invalid FY/doctor/week coverage
   - Admin linked importing for another physician
   - Admin unlinked importing for any active physician
   - Any role with FY not in collecting
4. Authorization sanity:
   - Non-admin cannot import for other physicians (backend enforcement)

## References & Research

### Internal References

- `docs/brainstorms/2026-02-19-preferences-wizard-week-import-parity-brainstorm.md`
- `src/app/(authenticated)/preferences/page.tsx:19`
- `src/components/wizard/week-availability-step.tsx:35`
- `src/features/dashboard/components/App.tsx:181`
- `src/features/dashboard/components/App.tsx:2556`
- `src/features/dashboard/components/App.tsx:3354`
- `convex/functions/scheduleRequests.ts:403`
- `src/shared/services/scheduleImport.ts:450`
- `convex/functions/physicians.ts:326`
- `src/middleware.ts:50`
- `docs/solutions/logic-errors/dashboard-convex-query-nullability-regression-20260218.md`

### Tests

- `tests/scheduleImportParser.test.ts`
- `tests/scheduleImportValidation.test.ts`
- `tests/scheduleImportClientValidation.test.ts` (new)
