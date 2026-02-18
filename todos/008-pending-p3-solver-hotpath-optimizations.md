---
status: complete
priority: p3
issue_id: "008"
tags: [code-review, performance, auto-fill, solver]
dependencies: []
---

# Auto-Fill Solver Hot-Path Algorithmic Inefficiencies

## Problem Statement

Three algorithmic inefficiencies exist in the auto-fill solver. None cause correctness issues or timeouts at current scale (15-20 physicians, 52 weeks, 8 rotations), but they represent unnecessary O(N) → O(1) upgrades and one O(N²) pattern that will degrade as the dataset grows.

## Findings

### 1. Linear `weeks.find()` in hard constraint loop (Low severity)

**Location:** `convex/lib/autoFillSolver.ts:518-525`

```typescript
// Called for every physician × every cell = ~7,800 times
const activeFromWeek = weeks.find((w) => w._id === physician.activeFromWeekId); // O(52)
```

Fix: Use the `weekNumberById` Map already built at line 132. Pass it into `getHardConstraintCandidates`.

### 2. O(N²) Pass 2 remaining cells filter

**Location:** `convex/lib/autoFillSolver.ts:205-207`

```typescript
const remainingCells = state.emptyCells.filter(
  (c) => !resultAssignments.some((a) => a.weekId === c.weekId && a.rotationId === c.rotationId),
);
```

With 416 cells, this is 416 × 400 = 166,400 string comparisons. Fix: Build a Set of `weekId:rotationId` keys during Pass 1 and use O(1) Set lookups.

### 3. O(M) linear scans in Pass 3 hill-climbing pair loop

**Location:** `convex/lib/autoFillSolver.ts:295-307`

```typescript
// Inside a double loop: O(N² × M × iterations)
const existingA1 = existingAssignments.find(
  (e) => e.weekId === a1.weekId && e.rotationId === a1.rotationId,
);
```

Fix: Convert `existingAssignments` to a `Map<string, ExistingAssignment>` keyed by `weekId:rotationId` before Pass 3.

## Proposed Solutions

### Option A (Recommended): Fix all three in one pass

All three fixes are mechanical O(1) Map/Set substitutions with no logic changes:

```typescript
// Fix 1: Pass weekNumberById into getHardConstraintCandidates
const weekNum = weekNumberById.get(physician.activeFromWeekId);
if (weekNum && weekNumber < weekNum) continue;

// Fix 2: Set for filled cells
const filledCells = new Set<string>();
// During Pass 1 when assigning: filledCells.add(`${weekId}:${rotationId}`)
const remainingCells = state.emptyCells.filter(c => !filledCells.has(`${c.weekId}:${c.rotationId}`));

// Fix 3: Map for Pass 3
const existingByCell = new Map(existingAssignments.map(e => [`${e.weekId}:${e.rotationId}`, e]));
const existingA1 = existingByCell.get(`${a1.weekId}:${a1.rotationId}`);
```

- **Effort:** Medium (~1 hour for all three, including test verification)
- **Risk:** Low (pure algorithmic substitution, same results)

## Recommended Action

Option A — batch all three solver optimizations together.

## Technical Details

**Affected files:**
- `convex/lib/autoFillSolver.ts` — lines 132-133, 205-207, 295-307, 489-525, 579-600

## Acceptance Criteria

- [ ] `weeks.find()` replaced with Map lookup in `getHardConstraintCandidates`
- [ ] Pass 2 remaining cells uses Set instead of `Array.some()`
- [ ] Pass 3 `existingAssignments.find()` uses pre-built Map
- [ ] All existing auto-fill tests pass (`npm run test`)
- [ ] TypeScript clean

## Work Log

- 2026-02-17: Identified by performance agent (Issues 3a, 3b, 3c — severity LOW to HIGH for solver CPU time).
