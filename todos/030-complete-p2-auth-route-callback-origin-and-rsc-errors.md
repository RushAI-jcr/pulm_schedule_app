---
status: complete
priority: p2
issue_id: "030"
tags: [code-review, auth, frontend, reliability, ux]
dependencies: []
---

# Auth CTA flow is brittle across local ports and emits client navigation errors

## Problem Statement

Public-page CTAs (`Sign in`, `Create account`, `Forgot password`) route through internal Next.js route handlers that redirect to WorkOS. In browser testing on `localhost:3010`, redirects contained `redirect_uri=http://localhost:3000/callback`, causing cross-origin fetch failures and repeated console errors during client navigation.

This is an important reliability issue for local/dev environments and increases noise when validating auth flow behavior.

## Findings

- Reproduction: run frontend on non-default port and click auth CTAs from `/`.
- Observed redirect URL includes hardcoded/default callback at `localhost:3000` while app origin is `localhost:3010`.
- Observed errors include failed RSC payload fetch and CORS failures during transition.
- Relevant files:
  - `src/app/page.tsx:24` uses `Link` to `/sign-in`, `/sign-up`, `/reset-password`.
  - `src/app/sign-in/route.ts:5` calls `getSignInUrl()` without explicit origin-safe redirect strategy.
  - `src/app/sign-up/route.ts:5` calls `getSignUpUrl()` similarly.
  - `src/app/reset-password/route.ts:8` calls `getSignInUrl({ loginHint })` similarly.

## Proposed Solutions

### Option 1: Compute callback URL from request origin in route handlers (Recommended)

**Approach:** Build redirect/callback URL per request origin for local/dev, and pass it explicitly when requesting WorkOS URLs.

**Pros:**
- Works across any local port and preview host.
- Removes environment-specific brittleness.

**Cons:**
- Requires careful handling for production host allowlist.

**Effort:** Small

**Risk:** Low

---

### Option 2: Keep current callback config but force full navigation for auth links

**Approach:** Replace `Link` with plain `<a>` for auth routes to avoid client RSC fetch behavior against redirecting route handlers.

**Pros:**
- Reduces client-side RSC navigation noise.
- Minimal code change.

**Cons:**
- Does not solve callback-origin mismatch itself.
- Still relies on environment config correctness.

**Effort:** Small

**Risk:** Medium

---

### Option 3: Centralize auth URL generation in one helper

**Approach:** Add shared helper for sign-in/sign-up/reset routes that resolves callback URL and policy in one place.

**Pros:**
- Consistent behavior and easier maintenance.
- Prevents drift across three route handlers.

**Cons:**
- Slightly larger refactor.

**Effort:** Medium

**Risk:** Low

## Recommended Action

Implement Option 1 and optionally combine with Option 2 for cleaner browser transitions.

## Technical Details

**Affected files:**
- `src/app/page.tsx`
- `src/app/sign-in/route.ts`
- `src/app/sign-up/route.ts`
- `src/app/reset-password/route.ts`

**Validation evidence:**
- Playwright stale-button pass on `/`, `/sign-in`, `/sign-up`, `/reset-password` with app running on `localhost:3010`.

**Database changes (if any):**
- No

## Resources

- Review command runbook context: `docs/runbooks/local-development.md`

## Acceptance Criteria

- [ ] Auth CTAs work from non-default local ports without callback mismatch.
- [ ] No RSC fetch/CORS error spam during CTA navigation.
- [ ] Public page stale-button pass succeeds on all four routes.

## Work Log

### 2026-02-18 - Review discovery

**By:** Codex

**Actions:**
- Executed browser pass on public routes using Playwright.
- Clicked all primary CTAs and captured resulting URL + console behavior.
- Confirmed mismatch between running origin and callback origin.

**Learnings:**
- Route handlers are functionally wired, but callback origin policy is brittle and surfaced as noisy client errors.

## Notes

- This is an important fix for predictable local development and CI preview validation.
