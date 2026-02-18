---
status: complete
priority: p3
issue_id: "028"
tags: [code-review, security, convex, authorization]
---

# `getAutoFillDecisionLog` uses `requireAuthenticatedUser` instead of `requireAdmin`

## Problem Statement
`getAutoFillDecisionLog` in `convex/functions/masterCalendar.ts` requires only authentication to retrieve the full auto-fill decision log for any master calendar. The log contains physician IDs, rotation IDs, scores, and score breakdowns. Any authenticated user who knows or guesses a valid `masterCalendarId` can retrieve this admin-only data. The frontend only calls this from the admin decision log panel, but the Convex API is callable directly.

## Findings
- `convex/functions/masterCalendar.ts` lines 1914–1920: `await requireAuthenticatedUser(ctx)` instead of `requireAdmin`
- Log contains physician IDs, assignment scores, preference satisfaction data — intended for admin use only
- Frontend only shows this in admin panel but backend has no enforcement

## Proposed Solutions

### Option A: Change to requireAdmin (Recommended)
**Effort:** Trivial | **Risk:** Low
```ts
handler: async (ctx, args) => {
  await requireAdmin(ctx)  // was requireAuthenticatedUser
  ...
}
```

## Acceptance Criteria
- [ ] `getAutoFillDecisionLog` requires admin role
- [ ] Non-admin authenticated users receive an authorization error
- [ ] Admin panel still works correctly

## Work Log
2026-02-17 — Identified by security-sentinel agent during code review of `feat/calendar-visual-overhaul`.
