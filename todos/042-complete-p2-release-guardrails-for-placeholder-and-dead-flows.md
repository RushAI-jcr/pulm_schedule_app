---
status: complete
priority: p2
issue_id: "042"
tags: [code-review, qa, ci, production-readiness, quality]
dependencies: ["040"]
---

# Add Automated Guardrails Against Placeholder And Dead Feature Exposure

## Problem Statement

The current release checks (typecheck/tests/build/auth guards) do not prevent shipping authenticated routes that still contain placeholder/"coming soon" states while exposed in primary navigation. This allowed a production-visible non-functional flow.

## Findings

- Current verification stack passed: `npm run typecheck`, `npm run test`, `npm run test:authz`, `npm run build`.
- Despite green checks, `src/app/(authenticated)/trades/page.tsx:14` still includes "Trade center coming soon".
- Trades remains linked from primary nav (`src/components/layout/app-sidebar.tsx:49`, `src/components/layout/mobile-nav.tsx:31`).
- No existing test in `tests/` enforces route readiness for nav-linked features or forbids placeholder copy in live authenticated pages.

## Proposed Solutions

### Option 1: CI Content Guard For Authenticated Routes

**Approach:** Add a test/script that fails CI when forbidden phrases (`coming soon`, `not implemented`, etc.) appear in `src/app/(authenticated)/**/page.tsx`.

**Pros:**
- Fast to implement.
- Immediately blocks obvious placeholder regressions.

**Cons:**
- Keyword-based check can be bypassed by wording changes.
- Needs allowlist for legitimate instructional copy.

**Effort:** Small

**Risk:** Low

---

### Option 2: Navigation Readiness Contract Test

**Approach:** Add a test that enumerates nav entries and verifies each route renders a non-placeholder primary action/state.

**Pros:**
- More robust than string matching.
- Encodes product-level readiness expectations.

**Cons:**
- Higher setup complexity.
- Needs stable selectors/contracts across pages.

**Effort:** Medium

**Risk:** Medium

---

### Option 3: Feature Registry + Compile-Time Gating

**Approach:** Introduce a typed feature registry (`live`, `beta`, `hidden`) consumed by nav and route guards.

**Pros:**
- Centralized rollout control.
- Eliminates accidental nav exposure.

**Cons:**
- Requires architecture changes across navigation and route handling.

**Effort:** Medium-Large

**Risk:** Medium

## Recommended Action


## Technical Details

**Affected files:**
- `package.json` (new script wired into `check`)
- `tests/` (new readiness test)
- `src/components/layout/app-sidebar.tsx`
- `src/components/layout/mobile-nav.tsx`
- `src/app/(authenticated)/**/page.tsx`

**Database changes (if any):**
- Migration needed? No
- New columns/tables? No

## Resources

- **Current placeholder:** `src/app/(authenticated)/trades/page.tsx:14`
- **Current nav exposure:** `src/components/layout/app-sidebar.tsx:49`
- **Current nav exposure:** `src/components/layout/mobile-nav.tsx:31`
- **Current check pipeline:** `package.json`

## Acceptance Criteria

- [ ] CI fails if authenticated live routes include forbidden placeholder copy.
- [ ] CI fails if nav exposes a route not marked production-ready.
- [ ] Guardrail is documented for contributors.
- [ ] Existing checks continue to pass with guardrail enabled.

## Work Log

### 2026-02-19 - Process gap finding from release review

**By:** Codex

**Actions:**
- Ran current validation scripts and confirmed all green.
- Compared nav-exposed routes against route content.
- Identified missing automated guard for placeholder exposure.

**Learnings:**
- Existing technical checks validate correctness/perf/build, not release-readiness semantics.

## Notes

- Dependent on issue `040` because the current blocker must be resolved or intentionally gated first.
