---
status: complete
priority: p2
issue_id: "004"
tags: [code-review, security, authorization, physicians]
dependencies: []
---

# listPhysiciansWithStatus Exposes PII to All Authenticated Users

## Problem Statement

`listPhysiciansWithStatus` requires only `requireAuthenticatedUser(ctx)` — meaning any logged-in physician or viewer can call it directly from their browser console or a custom Convex client. The response includes every physician's email address, admin role status, and `activeUntilWeekNumber` (which reveals when a physician is scheduled to leave). The admin-only UI at `/admin/physicians/` is correctly middleware-protected, but Convex queries are callable by any authenticated WebSocket client independent of the UI.

## Findings

**Location:** `convex/functions/physicians.ts:565-658`

```typescript
export const listPhysiciansWithStatus = query({
  args: { fiscalYearId: v.optional(v.id("fiscalYears")) },
  // Only requireAuthenticatedUser — any logged-in user can call this
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    // Returns: email, role (reveals who is admin), activeUntilWeekNumber (reveals departure)
  }
});
```

Note: `getPhysicians` also uses `requireAuthenticatedUser` and already exposes emails/roles. This is an existing pattern — `listPhysiciansWithStatus` adds `activeUntilWeekNumber` and `assignmentCount` as new disclosures.

## Proposed Solutions

### Option A (Recommended): Elevate to requireAdmin

Since the query is only called from `/admin/physicians/` (an admin-only page), simply change the auth guard:

```typescript
await requireAdmin(ctx);
```

Two-line change. No other callers exist (confirmed by codebase search).

- **Pros:** Minimal change, eliminates the exposure entirely.
- **Cons:** If a non-admin page ever needs a physician list, a separate query with appropriate field filtering will be needed.
- **Effort:** Trivial (2 lines)
- **Risk:** None

### Option B: Role-gated field projection

Keep `requireAuthenticatedUser` but return different fields based on resolved role:

```typescript
const role = await resolveEffectiveRole(ctx);
if (role !== "admin") {
  // Return minimal projection (no email, no role, no activeUntilWeekNumber)
  return physicians.map(p => ({ _id: p._id, firstName: p.firstName, lastName: p.lastName, initials: p.initials }));
}
// Full projection for admins
```

- **Pros:** Non-admin callers can still list physicians (e.g., for trade requests).
- **Cons:** More complex, need to ensure no sensitive fields leak in non-admin path.
- **Effort:** Small
- **Risk:** Low (but more surface area)

## Recommended Action

Option A — the query is only needed by admin pages. Apply `requireAdmin`.

## Technical Details

**Affected files:**
- `convex/functions/physicians.ts:567` — change `requireAuthenticatedUser` to `requireAdmin`

## Acceptance Criteria

- [ ] `listPhysiciansWithStatus` requires admin role
- [ ] Non-admin call returns auth error, not physician data
- [ ] Admin physicians page continues to work correctly
- [ ] `scripts/verify-auth-guards.sh` passes

## Work Log

- 2026-02-17: Identified by security agent (SEC-02, Medium severity).
