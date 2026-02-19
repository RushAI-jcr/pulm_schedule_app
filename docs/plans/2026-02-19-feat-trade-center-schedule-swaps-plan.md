---
title: "feat: Trade Center for Schedule Swap Management"
type: feat
date: 2026-02-19
brainstorm: docs/brainstorms/2026-02-17-ui-ux-overhaul-brainstorm.md
---

# Trade Center for Schedule Swap Management

## Overview

Implement the dedicated `/trades` experience so physicians can propose, respond to, and track schedule trades with clear status visibility, while preserving existing admin approval flow and server-side guardrails.

The backend trade lifecycle already exists; this effort primarily completes the physician-facing product surface and closes UX/testing gaps around it.

## Problem Statement / Motivation

`/trades` currently renders a placeholder only, despite having production Convex endpoints for full trade lifecycle actions.

Current gap:
1. Physicians do not have a dedicated UI to propose trades from their own assignments.
2. Incoming trade actions (accept/decline) and requester cancel actions are not available on `/trades`.
3. Status/history tracking is not surfaced in the dedicated page.
4. Edge cases (admin without physician profile, unpublished fiscal year, missing published calendar) are backend-enforced but not yet represented with intentional UI states.

## Research Summary

### Brainstorm context used

Found relevant brainstorm from 2026-02-17: `docs/brainstorms/2026-02-17-ui-ux-overhaul-brainstorm.md`.

Trade-relevant decisions carried into this plan:
- Trades are a first-class physician navigation item.
- Admin trade approval remains in `/admin/requests`.
- Trade updates should be visible and understandable in-app.

### Repository findings

- `/trades` is placeholder-only today:
  - `src/app/(authenticated)/trades/page.tsx:10`
  - `src/app/(authenticated)/trades/page.tsx:14`
- Convex trade API surface is already complete:
  - `convex/functions/tradeRequests.ts:242` (`getTradeProposalOptions`)
  - `convex/functions/tradeRequests.ts:385` (`getTradeCandidatesForAssignment`)
  - `convex/functions/tradeRequests.ts:712` (`getMyTrades`)
  - `convex/functions/tradeRequests.ts:825` (`proposeTrade`)
  - `convex/functions/tradeRequests.ts:937` (`respondToTrade`)
  - `convex/functions/tradeRequests.ts:969` (`cancelTrade`)
  - `convex/functions/tradeRequests.ts:1000` (`adminResolveTrade`)
- Trade policy and authorization rules are already codified and tested:
  - `convex/lib/workflowPolicy.ts:36`
  - `convex/lib/workflowPolicy.ts:56`
  - `tests/workflowPolicy.test.ts:51`
- Rate limiting is defined for all trade mutations:
  - `convex/lib/rateLimit.ts`
  - `tests/rateLimit.test.ts:12`
- Legacy dashboard contains existing trade UI patterns we can reuse/extract:
  - `src/features/dashboard/components/App.tsx:2755`
  - `src/features/dashboard/components/App.tsx:3626`
- Admin queue remains in `/admin/requests` and should stay there:
  - `src/app/(authenticated)/admin/requests/page.tsx`
- Current admin page renders only `peer_accepted` requests in the pending list; `proposed` requests are fetched but not surfaced as actionable deny-only rows:
  - `src/app/(authenticated)/admin/requests/page.tsx:90`
  - `convex/functions/tradeRequests.ts:807`

### Institutional learnings

- Keep strict typing and avoid `any`-based contract drift in UI integration code:
  - `docs/solutions/logic-errors/convex-contract-type-erasure-dashboard-app-20260218.md`
- Maintain explicit Convex `returns` validator discipline and typed query contracts:
  - `docs/solutions/logic-errors/convex-backend-audit-type-safety-and-validators.md`

### External research decision

Skipped. This is an internal feature completion with strong existing architecture and implementation patterns already present in-repo.

## SpecFlow Analysis

### Primary user flows

1. Physician proposes trade
- Opens `/trades`
- Selects one of own assignments to give up
- Selects target assignment to request
- Optionally enters reason
- Submits and sees new row in trade history with `proposed` status

2. Target physician responds
- Opens `/trades`
- Sees incoming `proposed` request
- Accepts or declines
- Status transitions to `peer_accepted` or `peer_declined`

3. Requester cancels
- Requester cancels unresolved trade (`proposed` or `peer_accepted`)
- Status transitions to `cancelled`

4. Admin resolves in existing admin queue
- Admin reviews trade queue in `/admin/requests`
- Denies invalid requests at `proposed` or `peer_accepted` status
- Approves only `peer_accepted` requests (assignment swap)
- Physician history reflects `admin_approved` or `admin_denied`

### Flow permutations and required UI states

| Condition | Required `/trades` behavior |
|---|---|
| No active fiscal year or FY not `published` | Show read-only unavailable state with backend reason |
| Published FY but no published calendar | Show unavailable state with reason |
| Linked physician with no trades yet | Show empty state + propose form enabled |
| Linked physician with incoming trade | Show actionable accept/decline controls |
| Linked physician with outgoing unresolved trade | Show cancel control |
| Admin/physician role but no linked physician profile | Show explicit “account not linked” guidance, no mutation controls |

### Gaps identified

1. Dedicated `/trades` product flow is missing entirely.
2. Existing trade query `getTradeCandidatesForAssignment` is not used in UI yet and should drive recommendation UX.
3. No focused trade end-to-end coverage exists for the dedicated page route.

## Proposed Solution

Build a dedicated Trade Center page with three sections:

1. Proposal composer
- Step A: choose `my assignment`
- Step B: choose target assignment (with optional suggestion mode)
- Step C: optional reason and submit

2. Suggested candidates panel (optional but recommended in MVP)
- For selected offered assignment, call `getTradeCandidatesForAssignment`
- Show ranked candidate physicians and their suggested assignment options
- One-click select into proposal form

3. My trade history/action queue
- Unified list from `getMyTrades`
- Show role-aware row actions:
  - target can accept/decline when `proposed`
  - requester can cancel when `proposed` or `peer_accepted`
- Show status badges and timestamps

4. Admin queue parity adjustment (no route ownership change)
- Keep `/admin/requests` as the only admin trade resolution surface.
- Surface `proposed` rows as deny-only actions.
- Keep approve action gated to `peer_accepted` status only.

Admin approval UX remains on `/admin/requests` (existing route ownership), while `/trades` surfaces status progression clearly so physicians can track outcomes.

## Technical Considerations

- Preserve server-side authorization as source of truth (`getCurrentPhysician`, workflow policy guards).
- Keep Convex function interfaces unchanged unless a concrete UX gap requires backend extension.
- Prefer extracted, typed reusable trade UI components over embedding large logic directly in route page.
- Keep route-level loading/empty/error/unlinked states explicit to avoid nullability regressions.
- Reuse existing `StatusBadge`, `EmptyState`, `PageSkeleton`, and form primitives for consistency.
- Adopt explicit UI test harness for this feature: Vitest + React Testing Library + jsdom.
- Add backend query latency budget for `/trades` critical data (`getTradeProposalOptions`) and enforce with targeted regression checks.

## Implementation Plan

### Phase 1: Route-level Trade Center shell

- [ ] Replace placeholder in `src/app/(authenticated)/trades/page.tsx` with a composed page:
  - trade availability status
  - proposal section
  - history/action section
- [ ] Add unlinked physician guard state using `api.auth.loggedInUser` role/profile data.

### Phase 2: Trade proposal flow

- [ ] Implement `TradeProposalCard` component in `src/components/trades/trade-proposal-card.tsx`.
- [ ] Wire queries/mutations:
  - `api.functions.tradeRequests.getTradeProposalOptions`
  - `api.functions.tradeRequests.proposeTrade`
- [ ] Handle optimistic submit UX with disable/retry and toast feedback.
- [ ] Preserve backend error messaging for invalid/duplicate proposals.

### Phase 2.5: Backend performance hardening (no API contract change)

- [ ] Refactor `getTradeProposalOptions` hydration loops to use parallel fetch patterns (`Promise.all`) rather than sequential `ctx.db.get` loops.
- [ ] Extract hydration helper to `convex/lib/` (for readability + reuse) without changing return shape.
- [ ] Add lightweight latency verification script/fixture (seeded local dataset) to confirm proposal-options query remains responsive at realistic roster size.
- [ ] Define and document target budget: proposal options query returns within 500ms p95 on local seeded FY dataset.

### Phase 3: Suggested candidates integration

- [ ] Implement `TradeCandidateSuggestions` in `src/components/trades/trade-candidate-suggestions.tsx`.
- [ ] Use `api.functions.tradeRequests.getTradeCandidatesForAssignment` after requester assignment selection.
- [ ] Display exclusion summary and ranked candidate options to reduce manual searching.

### Phase 4: My trades history and row actions

- [ ] Implement `TradeHistoryTable` in `src/components/trades/trade-history-table.tsx`.
- [ ] Wire data/actions:
  - `api.functions.tradeRequests.getMyTrades`
  - `api.functions.tradeRequests.respondToTrade`
  - `api.functions.tradeRequests.cancelTrade`
- [ ] Enforce row-level action visibility by actor role in each trade row.

### Phase 5: Admin coordination and polish

- [ ] Validate status parity between `/trades` and `/admin/requests` without changing admin queue ownership.
- [ ] Update `/admin/requests` trade tab to render `proposed` trades in pending queue as deny-only (approve remains disabled for non-`peer_accepted`).
- [ ] Add clear row copy for admin state: `Awaiting peer response` vs `Ready for admin approval`.
- [ ] Add optional deep link from `/trades` info text to `/admin/requests` for admin users.
- [ ] Ensure mobile behavior remains usable (stacked cards/table fallback).

### Phase 6: Test and quality gates

- [ ] Establish explicit UI test setup for route/component interactions:
  - add dev dependencies: `@testing-library/react`, `@testing-library/user-event`, `jsdom`
  - add `vitest.config.ts` browser-like test environment for UI specs
  - add script `test:ui` in `package.json`
- [ ] Add/extend tests for trade page interaction paths in `tests/` (new file: `tests/tradesPageFlows.test.tsx`).
- [ ] Cover role/action matrix in UI tests:
  - target physician sees accept/decline on `proposed`
  - requester sees cancel on `proposed` and `peer_accepted`
  - unlinked physician/admin sees guidance and no mutation controls
  - unavailable trade window shows non-actionable state
- [ ] Expand `tests/workflowPolicy.test.ts` only if lifecycle states change.
- [ ] Run required verification commands:
  - `npm run lint`
  - `npm run test`
  - `npm run test:ui`
  - `npm run build`

### Phase 7: Metrics and observability

- [ ] Define measurable product metrics derived from existing `tradeRequests` lifecycle data (no new telemetry table required initially):
  - proposal-to-peer-response conversion rate
  - peer-accepted to admin-approved conversion rate
  - median time from `createdAt` to `resolvedAt`
- [ ] Extend trade report backend payload in `convex/functions/reports.ts` if needed to expose these fields.
- [ ] Extend `/admin/reports` trade activity report UI to display these metrics for ongoing monitoring.

## Acceptance Criteria

- [ ] `/trades` no longer shows “coming soon”; it provides actionable trade workflows.
- [ ] Linked physician can propose a trade from owned assignment to another physician’s assignment.
- [ ] Target physician can accept/decline incoming proposed trades from `/trades`.
- [ ] Requester can cancel unresolved trades from `/trades`.
- [ ] Physicians can track final statuses (`peer_declined`, `admin_approved`, `admin_denied`, `cancelled`).
- [ ] When trade window is unavailable, page shows clear non-actionable reason.
- [ ] Unlinked physician/admin sees explicit guidance instead of broken mutation/query behavior.
- [ ] Existing admin approval workflow in `/admin/requests` remains intact.
- [ ] Admin can deny invalid `proposed` requests from `/admin/requests` while approve remains `peer_accepted`-only.
- [ ] Typecheck/tests/build pass with no new `any` regressions in touched files.

## Success Metrics

- Proposal-to-peer-response conversion rate is visible in admin reports and trends upward post-launch.
- Peer-accepted to admin-approved conversion rate remains stable or improves after Trade Center release.
- Median time-to-resolution (from `createdAt` to final `resolvedAt`) is measurable and decreases over first rollout cycle.
- No authorization regressions for trade actions across physician/admin/viewer roles.

## Dependencies & Risks

### Dependencies

- Existing Convex trade lifecycle functions in `convex/functions/tradeRequests.ts`.
- Existing auth/linkage semantics from `api.auth.loggedInUser` and `getCurrentPhysician`.

### Risks and mitigations

1. Risk: unlinked account access produces confusing errors.
- Mitigation: route-level unlinked guard with clear instructions before showing action controls.

2. Risk: action controls appear for wrong actor in shared history list.
- Mitigation: explicit actor/ownership checks in UI plus backend-enforced permissions.

3. Risk: complex proposal UI becomes hard to scan on mobile.
- Mitigation: split into small cards and progressive disclosure (selection first, then submit).

4. Risk: drift between legacy dashboard trade UI and new route behavior.
- Mitigation: treat Convex API contracts as single source of truth; verify parity in manual QA matrix.

## Out of Scope

- Reworking trade business rules in `convex/lib/workflowPolicy.ts`.
- New notification delivery channels (email/push).
- Admin approval workflow redesign in `/admin/requests`.
- Schema migrations unless a concrete gap appears during implementation.

## Verification Plan

1. Role and linkage matrix
- Physician linked: propose/respond/cancel paths function.
- Admin linked physician profile: can use physician trade flows and admin queue.
- Admin unlinked profile: receives guidance, no broken actions.
- Viewer: cannot access trade actions.

2. Lifecycle matrix
- Proposed -> peer accepted -> admin approved
- Proposed -> peer declined
- Proposed -> cancelled
- Peer accepted -> cancelled
- Proposed -> admin denied (from admin queue deny-only path)

3. Guardrail checks
- FY not published blocks proposal actions with clear reason.
- Duplicate open trade proposal returns expected error UI.
- Rate limit errors are surfaced with readable messages.
- Admin queue shows approve disabled unless status is `peer_accepted`.

4. Build/test gates
- `npm run lint`
- `npm run test`
- `npm run test:ui`
- `npm run build`

## References & Research

### Internal references

- `docs/brainstorms/2026-02-17-ui-ux-overhaul-brainstorm.md`
- `src/app/(authenticated)/trades/page.tsx:10`
- `convex/functions/tradeRequests.ts:242`
- `convex/functions/tradeRequests.ts:385`
- `convex/functions/tradeRequests.ts:712`
- `convex/functions/tradeRequests.ts:825`
- `convex/functions/tradeRequests.ts:937`
- `convex/functions/tradeRequests.ts:969`
- `convex/functions/tradeRequests.ts:1000`
- `convex/lib/workflowPolicy.ts:36`
- `tests/workflowPolicy.test.ts:51`
- `convex/lib/rateLimit.ts`
- `src/features/dashboard/components/App.tsx:2755`
- `src/features/dashboard/components/App.tsx:3626`
- `src/app/(authenticated)/admin/requests/page.tsx`
- `docs/architecture/authorization-matrix.md`
- `docs/architecture/authorization-test-cases.md`
- `docs/solutions/logic-errors/convex-contract-type-erasure-dashboard-app-20260218.md`
- `docs/solutions/logic-errors/convex-backend-audit-type-safety-and-validators.md`
