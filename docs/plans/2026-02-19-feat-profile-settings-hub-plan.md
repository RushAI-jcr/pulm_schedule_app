---
title: Build Profile Settings Hub (Notifications, Calendar Export, Account Details)
type: feat
date: 2026-02-19
status: active
brainstorm: docs/brainstorms/2026-02-17-ui-ux-overhaul-brainstorm.md
---

# Build Profile Settings Hub (Notifications, Calendar Export, Account Details)

## Finalized Technical Decisions

1. **Data model:** keep a dedicated `userSettings` table (not merged into `users`) with safe upsert behavior.
2. **Export behavior:** v1 stores defaults only and links users to existing `/calendar` export flow; no second ICS generator on `/profile`.
3. **Validation/tests:** add explicit negative-path coverage for auth, enum validation, unknown keys, and cross-user write prevention.
4. **Role fallback:** normalize calendar scope at read/write so `department` is unavailable for non-admin users.

## Problem

`/profile` currently renders a placeholder despite navigation and copy promising account settings.

## Scope

### In scope
- Functional `/profile` settings screen.
- Persisted notification and calendar export preferences.
- Account details section with physician-link context.

### Out of scope
- Notification center UI and delivery pipeline expansion.
- New export engines or external calendar feed infrastructure.

## Implementation Plan

### Phase 1: Backend foundation

Files:
- `convex/schema.ts`
- `convex/lib/userSettings.ts` (new)
- `convex/functions/userSettings.ts` (new)

Work:
- Add `userSettings` table + `by_workosUserId` index.
- Add duplicate-row detection (`collect()` + length check) and clear integrity error.
- Implement `getMyUserSettings` and `updateMyUserSettings` using auth-derived identity only.
- Normalize `defaultExportScope` by role (`department` -> `my` for non-admin).

### Phase 2: Profile UI

Files:
- `src/app/(authenticated)/profile/page.tsx`
- `src/components/profile/account-details-card.tsx` (new)
- `src/components/profile/notification-preferences-card.tsx` (new)
- `src/components/profile/calendar-export-card.tsx` (new)
- `src/components/profile/profile-settings-skeleton.tsx` (new)

Work:
- Replace placeholder with sectioned settings layout.
- Show loading, signed-out, linked, and unlinked states.
- Support edit + save states with in-flight protection.
- Add quick action link to `/calendar` export.

### Phase 3: Integrate export defaults safely

Files:
- `src/app/(authenticated)/calendar/page.tsx`
- `src/components/calendar/ics-export-button.tsx`

Work:
- Apply saved default export scope once on calendar load.
- Respect saved `includeCalendarEvents` without changing ICS generation pipeline semantics.
- Keep existing export implementation as single source of truth.

### Phase 4: Tests and verification

Files:
- `tests/userSettings.test.ts` (new)

Work:
- Unit-test normalization and fallback rules.
- Validate duplicate/integrity behavior via helper-level coverage.
- Run `npm run typecheck` and `npm test`.

## Acceptance Criteria

- [ ] `/profile` is fully functional and no longer “coming soon”.
- [ ] Settings persist and reload correctly.
- [ ] Non-admin users cannot persist `department` export scope.
- [ ] `/profile` does not introduce a separate export pipeline.
- [ ] Typecheck/tests pass.

## Security & Integrity Gates

- [ ] Unauthenticated access to settings query/mutation is rejected.
- [ ] Unknown mutation keys are rejected by Convex validators.
- [ ] Invalid enum values are rejected.
- [ ] No mutation path accepts user identifiers from client payload.
- [ ] Duplicate settings rows are explicitly detected and surfaced.

## References

- `src/app/(authenticated)/profile/page.tsx`
- `src/app/(authenticated)/calendar/page.tsx`
- `src/components/calendar/ics-export-button.tsx`
- `convex/auth.ts`
- `docs/solutions/logic-errors/dashboard-convex-query-nullability-regression-20260218.md`
- `docs/solutions/feature-implementations/calendar-year-view-visual-overhaul.md`
