---
status: complete
priority: p2
issue_id: "044"
tags: [code-review, quality, workflow, trades, frontend]
dependencies: []
---

# Restore Requester Cancel Action For Peer-Accepted Trades

## Problem Statement

The Trades page currently blocks requesters from cancelling once the target physician has accepted, even though backend workflow policy explicitly allows cancellation in `peer_accepted` state prior to admin resolution. This creates a UI/backend contract mismatch and removes a valid self-service escape hatch.

## Findings

- UI gating limits cancel to proposed-only state:
  - `src/app/(authenticated)/trades/page.tsx:317`
  - `const canCancel = requester && trade.status === "proposed"`
- Backend workflow policy allows requester cancellation for both `proposed` and `peer_accepted` states:
  - `convex/lib/workflowPolicy.ts:64`
  - `convex/lib/workflowPolicy.ts:71`
- Existing tests assert `peer_accepted` cancellation is valid:
  - `tests/workflowPolicy.test.ts:120`
  - `tests/workflowPolicy.test.ts:123`

## Proposed Solutions

### Option 1: Align UI condition with backend policy

**Approach:** Change cancel availability to include both `proposed` and `peer_accepted` statuses.

**Pros:**
- Restores expected workflow behavior.
- Keeps UI consistent with enforced backend policy.
- Minimal code change.

**Cons:**
- Requires minor copy update to clarify when cancel is available.

**Effort:** Small

**Risk:** Low

---

### Option 2: Restrict backend policy to proposed-only

**Approach:** Change `canRequesterCancelTrade` to disallow cancellation after peer acceptance.

**Pros:**
- Keeps existing UI unchanged.

**Cons:**
- Breaks current policy contract and test expectations.
- Removes flexibility before admin action.

**Effort:** Small-Medium

**Risk:** Medium

## Recommended Action

Implemented Option 1: UI cancel gating now matches backend policy for requester-owned trades in `proposed` and `peer_accepted` states.

## Technical Details

**Affected files:**
- `src/app/(authenticated)/trades/page.tsx`
- `convex/lib/workflowPolicy.ts`
- `tests/workflowPolicy.test.ts`

**Related components:**
- Trades request lifecycle UI
- Trade workflow policy contract

**Database changes (if any):**
- Migration needed? No
- New columns/tables? No

## Resources

- `src/app/(authenticated)/trades/page.tsx:317`
- `convex/lib/workflowPolicy.ts:64`
- `tests/workflowPolicy.test.ts:120`

## Acceptance Criteria

- [x] Requester sees cancel action for `proposed` and `peer_accepted` trades.
- [x] Requester cannot cancel after admin-resolved statuses.
- [x] UI behavior and workflow policy remain consistent.
- [x] Trade workflow tests continue passing.

## Work Log

### 2026-02-19 - Review Finding

**By:** Codex

**Actions:**
- Reviewed routed Trades UI action gating.
- Cross-checked backend workflow policy and tests.
- Identified status mismatch between UI and backend contract.

**Learnings:**
- Policy tests already codify expected cancel behavior; UI needs parity.

### 2026-02-19 - Resolution

**By:** Codex

**Actions:**
- Updated trade action gating in `src/app/(authenticated)/trades/page.tsx` to allow requester cancel for `peer_accepted`.
- Re-ran full verification (`npm run check`) to ensure no regressions.

**Learnings:**
- Keeping status gating derived from shared policy rules avoids UI/backend drift in trade workflows.

## Notes

- Important but not merge-blocking because admin can still deny/resolve; impact is user control and workflow consistency.
