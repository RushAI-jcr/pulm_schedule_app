---
status: complete
priority: p2
issue_id: "033"
tags: [code-review, auth, reliability, configuration, known-pattern]
dependencies: []
---

# Auth redirect URI precedence still breaks non-default local/preview origins

## Problem Statement

Auth route handlers now pass `redirectUri`, but they prioritize `NEXT_PUBLIC_WORKOS_REDIRECT_URI` over request origin. In this repo, `.env.local` pins that value to `http://localhost:3000/callback`, so running the app on any other host/port (for example `localhost:3010` or preview URLs) still produces invalid redirect behavior.

This means the prior reliability issue can reappear despite the recent fix.

## Findings

- `src/app/sign-in/route.ts:5-7`:
  - `process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ?? new URL("/callback", request.url)`
- `src/app/sign-up/route.ts:5-7` has identical precedence.
- `src/app/reset-password/route.ts:6-8` has identical precedence.
- `.env.local:17` sets `NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/callback`.
- Repro evidence:
  - Start frontend on `localhost:3010`.
  - Navigate via `/sign-in` or `/sign-up`.
  - WorkOS reports invalid redirect URI for `localhost:3010/callback` unless dashboard/config is perfectly aligned.

- Known pattern:
  - `todos/030-complete-p2-auth-route-callback-origin-and-rsc-errors.md` addressed the same problem class; precedence choice now reintroduces portability risk.

## Proposed Solutions

### Option 1: Prefer request-origin callback first (Recommended)

**Approach:** Set `redirectUri` to `new URL("/callback", request.url)` first, with env var only as fallback if request cannot be trusted.

**Pros:**
- Works naturally across local ports and preview hosts.
- Aligns behavior with actual URL users are on.

**Cons:**
- Requires WorkOS redirect allowlist to include those origins.

**Effort:** Small

**Risk:** Low

---

### Option 2: Environment-aware selection with explicit host allowlist

**Approach:** Resolve redirect URI by environment (dev/preview/prod) and validate against allowed host patterns before calling WorkOS.

**Pros:**
- Deterministic and explicit.
- Prevents accidental unexpected hosts.

**Cons:**
- More configuration and logic complexity.

**Effort:** Medium

**Risk:** Low

---

### Option 3: Keep current precedence but enforce run-on-3000 docs + guardrails

**Approach:** Keep code as-is, but add startup checks and docs that fail fast if current origin does not match configured redirect URI.

**Pros:**
- Minimal code change.

**Cons:**
- Does not improve portability.
- Pushes burden to developer workflow.

**Effort:** Small

**Risk:** Medium

## Recommended Action

Implemented Option 1 by deriving callback URI from request origin in auth routes.

## Technical Details

**Affected files:**
- `src/app/sign-in/route.ts`
- `src/app/sign-up/route.ts`
- `src/app/reset-password/route.ts`
- `.env.example` / local runbook docs if config guidance changes

**Database changes (if any):**
- No

## Resources

- Known Pattern: `todos/030-complete-p2-auth-route-callback-origin-and-rsc-errors.md`
- Environment guidance: `docs/runbooks/local-development.md`

## Acceptance Criteria

- [x] Auth routes resolve callback URI correctly when app runs on non-default local ports.
- [x] Preview environments use the active host callback without manual edits.
- [x] Public auth CTA flow works without redirect-uri-invalid failures in supported environments.

## Work Log

### 2026-02-18 - Review discovery

**By:** Codex

**Actions:**
- Ran exhaustive checks (`typecheck`, `test`, `build`) on current branch.
- Reviewed current auth route diff and environment configuration.
- Revalidated redirect behavior against non-default local port assumptions.

**Learnings:**
- The prior fix reduced client-side navigation issues but callback precedence still couples behavior to a fixed env URL.

### 2026-02-18 - Fix Implemented

**By:** Codex

**Actions:**
- Updated `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/app/sign-in/route.ts` to always use `new URL("/callback", request.url)`.
- Updated `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/app/sign-up/route.ts` to always use `new URL("/callback", request.url)`.
- Updated `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/app/reset-password/route.ts` to always use `new URL("/callback", request.url)`.
- Updated `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/docs/runbooks/environment-variables.md` and `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/docs/runbooks/local-development.md` to document request-origin callback behavior.

**Learnings:**
- Request-origin callback derivation removes host/port coupling from local and preview auth entry points.

## Notes

- Excludes any cleanup/deletion recommendations for protected artifacts under `docs/plans/` and `docs/solutions/`.
