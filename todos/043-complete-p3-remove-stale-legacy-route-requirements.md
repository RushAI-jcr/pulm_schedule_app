---
status: complete
priority: p3
issue_id: "043"
tags: [code-review, cleanup, middleware, maintainability]
dependencies: []
---

# Remove Stale Legacy Route Role Requirements

## Problem Statement

Middleware still contains role requirements for legacy route prefixes that are no longer part of the routed application. This adds noise and makes route security rules harder to reason about.

## Findings

- `src/middleware.ts:53` includes `/fy-setup`, `/heatmap`, and `/roster` as protected admin prefixes.
- No matching routed pages were found under `src/app/` for these prefixes.
- `src/middleware.ts:56` includes `/dashboard/admin`, which now redirects immediately (`src/app/dashboard/admin/page.tsx:4`).

## Proposed Solutions

### Option 1: Remove Unused Prefix Rules

**Approach:** Delete legacy route requirements that no longer map to real pages.

**Pros:**
- Cleaner and more auditable auth policy.
- Reduced cognitive overhead for maintainers.

**Cons:**
- Minimal chance of breaking unknown deep links if they still matter externally.

**Effort:** Small

**Risk:** Low

---

### Option 2: Keep Rules With Explicit Legacy Comments And Sunset Date

**Approach:** Retain entries but add explicit rationale and removal timeline.

**Pros:**
- Preserves backward-compatibility intent if needed.

**Cons:**
- Keeps clutter and ambiguity.

**Effort:** Small

**Risk:** Low

## Recommended Action


## Technical Details

**Affected files:**
- `src/middleware.ts`
- `src/app/dashboard/admin/page.tsx` (context)

**Database changes (if any):**
- Migration needed? No
- New columns/tables? No

## Resources

- **Legacy route entries:** `src/middleware.ts:53`
- **Dashboard admin redirect:** `src/app/dashboard/admin/page.tsx:4`

## Acceptance Criteria

- [ ] Middleware route-role list contains only active route families or explicitly justified exceptions.
- [ ] Route access tests still pass (`npm run test:authz`).
- [ ] Auth policy comments reflect current architecture.

## Work Log

### 2026-02-19 - Middleware cleanup finding

**By:** Codex

**Actions:**
- Reviewed middleware route-role configuration.
- Cross-checked configured prefixes against app route files.
- Identified legacy-only prefixes with no active pages.

**Learnings:**
- Security policy remains correct but carries stale configuration debt.

## Notes

- P3 cleanup: not release-blocking, but improves policy clarity and reduces future mistakes.
