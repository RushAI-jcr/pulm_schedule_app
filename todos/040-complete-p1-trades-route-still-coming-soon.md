---
status: complete
priority: p1
issue_id: "040"
tags: [code-review, production-readiness, frontend, routing, trades]
dependencies: []
---

# Replace Trades Placeholder With Live Workflow

## Problem Statement

The authenticated navigation exposes `/trades` as a core scheduling feature, but the page currently renders a placeholder with "coming soon" copy. This is a production-beta blocker because users can click into a non-functional primary feature.

## Findings

- `src/app/(authenticated)/trades/page.tsx:14` renders `title="Trade center coming soon"`.
- `src/components/layout/app-sidebar.tsx:49` includes Trades in the primary sidebar.
- `src/components/layout/mobile-nav.tsx:31` and `src/components/layout/mobile-nav.tsx:38` include Trades in mobile primary navigation.
- `src/middleware.ts:51` explicitly grants authenticated physician/admin access to `/trades`, so this is an intended live route, not an internal stub.
- Legacy implementation logic already exists in `src/features/dashboard/components/App.tsx:2755` (`TradePanel`) and `src/features/dashboard/components/App.tsx:3626` (`AdminTradeQueue`), indicating backend support is available but not wired into the routed page.

## Proposed Solutions

### Option 1: Implement Routed Trade Center Now

**Approach:** Build `/trades` using current routed architecture and wire to existing trade Convex queries/mutations.

**Pros:**
- Removes beta blocker and ships promised capability.
- Aligns nav, routing, and backend feature set.
- Eliminates user confusion and trust erosion.

**Cons:**
- Medium implementation scope (UI, states, role-specific flows).
- Requires focused QA for propose/respond/cancel/approve lifecycle.

**Effort:** Medium (1-2 days)

**Risk:** Medium

---

### Option 2: Hide Trades Feature Until Ready

**Approach:** Temporarily remove `/trades` from sidebar/mobile/admin entry points and keep route protected or redirected.

**Pros:**
- Fast mitigation for beta launch.
- Prevents user access to placeholder page.

**Cons:**
- Delays a key workflow.
- Requires communication/update to release scope.

**Effort:** Small (<0.5 day)

**Risk:** Low

---

### Option 3: Feature-Flag Trades Route

**Approach:** Keep code path but gate nav and route with an environment flag (`NEXT_PUBLIC_ENABLE_TRADES`).

**Pros:**
- Controlled rollout and easy enablement.
- Prevents accidental exposure in production.

**Cons:**
- Adds config complexity.
- Still requires full implementation before flag-on.

**Effort:** Small-Medium

**Risk:** Low

## Recommended Action


## Technical Details

**Affected files:**
- `src/app/(authenticated)/trades/page.tsx`
- `src/components/layout/app-sidebar.tsx`
- `src/components/layout/mobile-nav.tsx`
- `src/middleware.ts`
- `src/features/dashboard/components/App.tsx`

**Related components/services:**
- Convex `tradeRequests` query/mutation handlers
- Auth role gating in middleware

**Database changes (if any):**
- Migration needed? No
- New columns/tables? No

## Resources

- **Route placeholder:** `src/app/(authenticated)/trades/page.tsx:14`
- **Desktop nav exposure:** `src/components/layout/app-sidebar.tsx:49`
- **Mobile nav exposure:** `src/components/layout/mobile-nav.tsx:31`
- **Legacy trade logic:** `src/features/dashboard/components/App.tsx:2755`
- **Legacy admin trade queue:** `src/features/dashboard/components/App.tsx:3626`
- **Planning context:** `docs/plans/2026-02-19-feat-trade-center-schedule-swaps-plan.md`

## Acceptance Criteria

- [ ] `/trades` no longer shows "coming soon" copy in production.
- [ ] Physician can propose, view, and manage trade requests from routed UI.
- [ ] Target physician can accept/decline via routed UI.
- [ ] Admin can resolve eligible trades where required.
- [ ] Sidebar/mobile navigation only expose flows that are fully functional.
- [ ] Regression checks pass (`npm run typecheck`, `npm run test`, `npm run build`).

## Work Log

### 2026-02-19 - Production Readiness Review Finding

**By:** Codex

**Actions:**
- Scanned app routes and nav surfaces for placeholders/dead flows.
- Verified `/trades` route is exposed in both desktop and mobile navigation.
- Confirmed page content is still placeholder-only.
- Located legacy trade implementation blocks for migration reference.

**Learnings:**
- The project already has trade backend and legacy UI logic; the blocker is routed-page integration.

## Notes

- This is a release-blocking (P1) issue for beta if trades are in declared scope.
