---
status: complete
priority: p1
issue_id: "036"
tags: [code-review, security, auth]
dependencies: []
---

# Name Auto-Link Can Link Untrusted Identities

Guarded name auto-link currently permits takeover of unclaimed physician profiles when an attacker controls a verified email and matching profile name.

## Problem Statement

The auto-link flow trusts exact first+last name plus verified email, with no domain trust, invite token, or admin approval gate. If a physician record is unlinked, any matching identity can be linked automatically.

## Findings

- `convex/lib/physicianLinking.ts:247` requires verified email but does not require trusted domain.
- `convex/lib/physicianLinking.ts:272` matches by normalized first+last only.
- `convex/lib/physicianLinking.ts:305` patches `physicians.userId` immediately on match.
- `convex/lib/physicianLinking.ts:308` inserts alias with source `auto_name_link` without secondary approval.

Impact:
- Unauthorized identity can claim a physician profile before legitimate first login.
- This is a direct account-link hijack path for unclaimed records.

## Proposed Solutions

### Option 1: Restrict Auto-Link to Trusted Domains

Approach: allow name auto-link only for `@rush.edu` (or configured allowlist), keep non-trusted domains viewer-only until admin aliasing.

Pros:
- Immediate risk reduction.
- Minimal architecture changes.

Cons:
- Reduces convenience for personal-email-first sign-ins.

Effort: Small-Medium
Risk: Low

---

### Option 2: Add Explicit Claim Token / Admin Approval

Approach: require one-time claim code, signed invite, or admin confirmation before first link from name-only resolution.

Pros:
- Strong identity assurance.
- Preserves flexibility for any domain.

Cons:
- More product and implementation overhead.

Effort: Medium-Large
Risk: Low-Medium

---

### Option 3: Keep Current Flow Behind Disabled-By-Default Flag

Approach: set `ENABLE_PHYSICIAN_NAME_AUTOLINK=false` by default and use operational runbook for temporary enable.

Pros:
- Immediate containment with current code.
- Gives time to design stronger linking proof.

Cons:
- Manual overhead for onboarding.

Effort: Small
Risk: Low

## Recommended Action

Implemented an explicit opt-in auto-link policy with domain allowlist enforcement and documentation-backed emergency disable.

## Technical Details

Affected files:
- `convex/lib/physicianLinking.ts:247`
- `convex/lib/physicianLinking.ts:272`
- `convex/lib/physicianLinking.ts:305`
- `convex/lib/physicianLinking.ts:308`

Related components:
- `convex/functions/physicians.ts:266`
- `src/app/callback/route.ts:21`

Database changes:
- None required for mitigation options 1/3.

## Resources

- Review context: `compound-engineering.local.md`

## Acceptance Criteria

- [x] Unauthorized personal-domain identities cannot auto-claim unlinked physician records.
- [x] Auto-link policy is explicitly enforced and test-covered.
- [x] Security tests include hostile-name-collision scenario.
- [x] Emergency disable path documented and validated.

## Work Log

### 2026-02-18 - Initial Discovery

By: Codex

Actions:
- Reviewed guarded name auto-link logic and write path.
- Assessed trust boundaries for verified email + name matching.
- Evaluated takeover scenario for unclaimed physician records.

Learnings:
- Current guardrails prevent ambiguity but do not establish ownership proof.

### 2026-02-18 - Mitigation Implemented

**By:** Codex

**Actions:**
- Added `isPhysicianNameAutoLinkEnabled()` in `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/convex/lib/physicianLinking.ts`.
- Changed auto-link gate to explicit opt-in (`ENABLE_PHYSICIAN_NAME_AUTOLINK=true` required).
- Kept domain allowlist guard (`PHYSICIAN_NAME_AUTOLINK_ALLOWED_DOMAINS`, default `rush.edu`) in place.
- Added tests in `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/tests/physicianLinking.test.ts` for enablement toggle and allowlist behavior.
- Documented and templated emergency disable path in:
  - `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/.env.example`
  - `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/docs/runbooks/environment-variables.md`
  - `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/docs/runbooks/local-development.md`

**Learnings:**
- Default-deny toggle + domain allowlist provides immediate containment while preserving controlled rollout.

## Notes

- This is merge-blocking unless formally risk-accepted.
