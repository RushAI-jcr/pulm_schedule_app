---
status: complete
priority: p3
issue_id: "011"
tags: [code-review, agent-native, api, physicians]
dependencies: []
---

# Agent API Gaps: Missing getPhysicianById + getWeekByNumber Queries

## Problem Statement

Two small API gaps prevent agents from efficiently using the physician management features:

1. **No `getPhysicianById` query** — after calling `deactivatePhysician` or `updatePhysician`, an agent must scan all physicians via `getPhysicians` or `listPhysiciansWithStatus` to verify the updated record. No targeted single-physician lookup exists.

2. **No `getWeekByNumber` query** — mutations accept opaque week IDs, but the convenient representation is a week number (1-52). An agent must call `getWeeksByFiscalYear` (loads all 52 weeks), then filter client-side. The `by_fiscalYear_weekNumber` compound index already exists in the schema but is unused by any public query.

## Findings

**Agent-native reviewer finding 1 and 3.**

Schema already has `by_fiscalYear_weekNumber` index at `convex/schema.ts:65`.

`getPhysicians` returns all physicians — no single-physician lookup by ID.

## Proposed Solutions

### Fix 1: Add getPhysicianById to physicians.ts

```typescript
export const getPhysicianById = query({
  args: { physicianId: v.id("physicians") },
  returns: v.union(v.null(), v.object({
    _id: v.id("physicians"),
    firstName: v.string(), lastName: v.string(),
    initials: v.string(), email: v.string(),
    role: v.union(v.literal("physician"), v.literal("admin")),
    isActive: v.boolean(),
    activeFromWeekId: v.optional(v.id("weeks")),
    activeUntilWeekId: v.optional(v.id("weeks")),
  })),
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    return await ctx.db.get(args.physicianId);
  },
});
```

### Fix 2: Add getWeekByNumber to fiscalYears.ts

```typescript
export const getWeekByNumber = query({
  args: { fiscalYearId: v.id("fiscalYears"), weekNumber: v.number() },
  returns: v.union(v.null(), v.object({
    _id: v.id("weeks"), weekNumber: v.number(),
    startDate: v.string(), endDate: v.string(),
  })),
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    return await ctx.db
      .query("weeks")
      .withIndex("by_fiscalYear_weekNumber", (q) =>
        q.eq("fiscalYearId", args.fiscalYearId).eq("weekNumber", args.weekNumber)
      )
      .first();
  },
});
```

- **Effort:** Small (~30 min for both)
- **Risk:** None (additive queries)

## Acceptance Criteria

- [ ] `getPhysicianById` query added and returns the physician record or null
- [ ] `getWeekByNumber` query added using the existing `by_fiscalYear_weekNumber` index
- [ ] Both have proper `args` and `returns` validators
- [ ] Both have `requireAuthenticatedUser` guard
- [ ] TypeScript clean, `npm run lint:convex` passes

## Work Log

- 2026-02-17: Identified by agent-native reviewer (Findings 1 and 3). Low-effort additions that close clear API gaps.
