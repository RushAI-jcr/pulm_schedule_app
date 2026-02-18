---
status: complete
priority: p2
issue_id: "007"
tags: [code-review, performance, physicians, convex]
dependencies: []
---

# deactivatePhysician Uses Sequential Patches (Mutation Timeout Risk)

## Problem Statement

`deactivatePhysician` loops over each assignment that needs clearing and issues an individual `await ctx.db.patch()` call per assignment. A physician deactivated at week 20 of a 52-week calendar could have 30+ assignments to clear. Sequential awaited writes in a Convex mutation approach the ~1-second transaction time limit. With larger datasets (more rotations, longer fiscal years), this will time out.

Additionally: the operation patches the physician record (`activeUntilWeekId`) *before* clearing assignments. If the loop throws (e.g., hits a limit), the physician record is already updated but assignments remain partially uncleared.

## Findings

**Location:** `convex/functions/physicians.ts:508-556`

```typescript
// First: patches physician record
await ctx.db.patch(args.physicianId, { activeUntilWeekId: args.activeUntilWeekId });

// Then: sequentially patches each assignment
for (const assignment of assignments) {
  if (weekNumber > activeUntilWeek.weekNumber) {
    await ctx.db.patch(assignment._id, {  // ← sequential, one per assignment
      physicianId: undefined, ...
    });
    clearedCount++;
  }
}
```

## Proposed Solutions

### Option A (Recommended): Promise.all + reorder writes

1. Collect all assignment IDs to clear first (no DB writes).
2. Use `Promise.all()` for concurrent patches — Convex batches these into one transaction commit.
3. Patch the physician record last (after assignments are cleared).

```typescript
// Collect first
const toPatch = assignments
  .filter(a => weekNumberMap.get(String(a.weekId))! > activeUntilWeek.weekNumber)
  .map(a => a._id);

// Concurrent batch
await Promise.all(toPatch.map(id => ctx.db.patch(id, {
  physicianId: undefined, assignedBy: undefined,
  assignedAt: undefined, assignmentSource: undefined,
})));

// Physician record last
await ctx.db.patch(args.physicianId, { activeUntilWeekId: args.activeUntilWeekId });
```

- **Pros:** Eliminates serial await chain, reduces wall-clock time proportionally. Correct order ensures atomicity.
- **Effort:** Small (~10 lines changed)
- **Risk:** Low

### Option B: Leave as-is with a comment documenting the limit

Document that the sequential loop is bounded by `(52 weeks × rotations per physician)` and is safe at current scale (~30 patches).

- **Pros:** No code change.
- **Cons:** The timeout risk is real and will hit as the system scales. Doesn't fix the incorrect write order.
- **Effort:** Trivial
- **Risk:** Medium (tech debt that will cause production issues)

## Recommended Action

Option A — 10 lines to fix both the performance issue and the write order.

## Technical Details

**Affected files:**
- `convex/functions/physicians.ts:508-556` — `deactivatePhysician` handler

## Acceptance Criteria

- [ ] Assignment patches use `Promise.all()` instead of sequential `await`
- [ ] Physician record is patched after assignments are cleared
- [ ] Deactivation works correctly for a physician with 30+ assignments
- [ ] `clearedAssignments` count is still correct in return value

## Work Log

- 2026-02-17: Identified by performance agent (Issue 2, MEDIUM) and security agent (SEC-03, Low for write order). Combined into one P2 todo.
