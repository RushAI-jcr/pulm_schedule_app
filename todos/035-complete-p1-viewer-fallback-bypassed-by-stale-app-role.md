---
status: complete
priority: p1
issue_id: "035"
tags: [code-review, auth, security]
dependencies: []
---

# Viewer Fallback Bypassed by Stale App Role

Unlinked or inactive users can still resolve as `physician` because role calculation trusts persisted `users.role` even when no active physician link is found.

## Problem Statement

The new viewer fallback is intended to make unlinked users read-only, but current auth resolution still promotes users based on stale app profile role and physicianId fields.

## Findings

- `convex/lib/auth.ts:60` computes role using `appUser?.role` even when `physician` is null.
- `convex/auth.ts:47` does the same for `loggedInUser`.
- `convex/auth.ts:60` returns `physicianId: physician?._id ?? appUser?.physicianId ?? null`, which can keep a stale physician link in client state.
- `convex/functions/physicians.ts:302` in `syncWorkosSessionUser` also preserves role priority from `existingUser?.role` when no physician is linked.

Impact:
- Users who were previously linked (or later deactivated/unlinked) can continue presenting as physician.
- Viewer guidance banner can be suppressed due to stale `physicianId`.
- Route and feature authorization can drift from real physician linkage state.

## Proposed Solutions

### Option 1: Force Non-Admin Unlinked Users to Viewer

Approach: if live physician resolution is null, set role to `viewer` unless explicit admin assignment is present.

Pros:
- Aligns runtime behavior with viewer-fallback requirement.
- Prevents stale physician access.

Cons:
- Requires careful treatment of legitimate admin-without-physician records.

Effort: Medium
Risk: Medium

---

### Option 2: Separate Effective Access Role from Stored Profile Role

Approach: keep stored `users.role` for audit/history but compute runtime role from live link + claims each request.

Pros:
- Strong separation between persisted metadata and access control.
- Easier to reason about deactivation/unlink transitions.

Cons:
- Requires broader refactor across auth and middleware assumptions.

Effort: Medium-Large
Risk: Medium

## Recommended Action

Viewer fallback is enforced via link-state role resolution; non-admin unlinked users are coerced to `viewer`, and `loggedInUser` returns physician linkage from live resolution only.

## Technical Details

Affected files:
- `convex/lib/auth.ts:60`
- `convex/auth.ts:47`
- `convex/auth.ts:60`
- `convex/functions/physicians.ts:302`

Related components:
- `src/hooks/use-user-role.ts`
- `src/components/layout/app-sidebar.tsx`
- `src/middleware.ts`

Database changes:
- No schema migration required.

## Resources

- Related prior auth exposure pattern: `todos/004-complete-p2-listphysicianswithstatus-pii-exposure.md`
- Review context: `compound-engineering.local.md`

## Acceptance Criteria

- [x] Unlinked/inactive users resolve to `viewer` at runtime.
- [x] `loggedInUser.physicianId` is null when no active physician link exists.
- [x] Deactivated physician accounts cannot access physician-only paths/features.
- [x] Tests added for stale app role + inactive physician scenarios.

## Work Log

### 2026-02-18 - Initial Discovery

By: Codex

Actions:
- Reviewed new auth/linking flow after multi-email implementation.
- Traced role and physicianId derivation across query and guard layers.
- Confirmed stale profile role fallback path.

Learnings:
- Runtime access role currently mixes persisted profile role with live linkage in a way that can preserve physician access after unlink/deactivation.

### 2026-02-18 - Validation + Test Reinforcement

**By:** Codex

**Actions:**
- Verified `resolveRoleForLinkState` usage in `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/convex/lib/auth.ts`, `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/convex/auth.ts`, and `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/convex/functions/physicians.ts`.
- Confirmed `loggedInUser` uses `physician?._id ?? null` and no longer falls back to stored `appUser.physicianId`.
- Added regression assertion in `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/tests/roles.test.ts` for stale role sources when `hasPhysicianLink=false`.

**Learnings:**
- Link-state-aware role resolution is the right boundary: profile metadata can persist, but access role must derive from live linkage.

## Notes

- This is merge-blocking due authorization drift risk.
