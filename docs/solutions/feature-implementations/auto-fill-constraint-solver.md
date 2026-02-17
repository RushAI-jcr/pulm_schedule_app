---
title: Multi-Pass Auto-Fill Constraint Solver with Holiday Parity
date: 2026-02-17
category: feature-implementations
component: auto-fill-solver
severity: high
tags:
  - auto-fill
  - constraint-solver
  - integration-tests
  - admin-ui
  - metrics
  - decision-log
  - prior-year-summary
  - physician-scheduling
  - testing
  - configuration
  - holiday-parity
  - workload-balancing
  - optimization
status: implemented
related_files:
  - convex/functions/masterCalendar.ts
  - convex/lib/autoFillSolver.ts
  - convex/lib/autoFillScorer.ts
  - convex/lib/autoFillHolidays.ts
  - convex/lib/autoFill.ts
  - tests/autoFillIntegration.test.ts
  - tests/autoFillSolver.test.ts
  - tests/autoFillScorer.test.ts
  - tests/autoFillHolidays.test.ts
  - src/components/admin/auto-fill-config-panel.tsx
  - src/components/admin/auto-fill-metrics-card.tsx
  - src/components/admin/auto-fill-decision-log.tsx
  - src/components/admin/prior-year-holiday-summary.tsx
---

# Multi-Pass Auto-Fill Constraint Solver with Holiday Parity

## Problem

The physician scheduling app originally used a greedy single-pass auto-assign algorithm with **15 identified weaknesses**:

1. No holiday awareness (Thanksgiving/Christmas not tracked)
2. No holiday parity enforcement across years
3. No workload spreading (some physicians overloaded, others underutilized)
4. No rotation variety enforcement
5. No gap enforcement between rotation stints
6. Greedy single-pass with no backtracking
7. No same-week conflict prevention (could assign physician to 2 rotations in same week)
8. Deterministic tiebreaker bias (always picked first physician alphabetically)
9. No transparency into scoring/decision-making
10. No undo capability (all assignments were permanent)
11. No prior-year context for fairness
12. No admin-tunable weights
13. No metrics for evaluating schedule quality
14. Poor test coverage
15. No decision log for audit/explainability

The goal was to produce **fair, optimized physician schedules** that:
- Enforce cross-year holiday parity (Thanksgiving/Christmas rotation)
- Balance workloads across physicians
- Prevent same-week double-booking
- Provide transparent scoring so admins can understand and trust the algorithm

## Solution Overview

Built a **three-layer constraint solver architecture** that runs in-memory and produces deterministic results:

**Layer 1: Hard Constraint Filter**
- Rotation eligibility
- cFTE headroom
- Week availability (red weeks blocked)
- Consecutive weeks limits
- Same-week conflict prevention

**Layer 2: Soft Constraint Scorer**
- Multi-dimensional 0-100 scoring based on:
  - Week preference (green vs yellow)
  - Rotation preference (ranked vs deprioritized)
  - Holiday parity (penalize physicians who worked same holiday last year)
  - Workload spread (bonus for physicians with fewer assigned weeks)
  - Rotation variety (bonus for physicians who haven't done this rotation recently)
  - Gap enforcement (bonus for larger gaps since last stint)

**Layer 3: Multi-Pass Optimization**
- **Pass 1**: Scored fill with shuffled iteration order (handles "easy" cells)
- **Pass 2**: Relaxed fill for remaining empty cells (handles "hard" cells)
- **Pass 3**: Hill-climbing swap optimization (improves solution)

The implementation includes full admin UI for configuration, metrics visualization, decision transparency, and undo capability.

## Architecture

### Core Modules

```
convex/lib/
├── autoFill.ts              - Core types, candidate filtering, same-week tracking
├── autoFillScorer.ts        - Multi-dimensional scoring engine
├── autoFillSolver.ts        - 3-pass solver (scored → relaxed → swap)
├── autoFillHolidays.ts      - Holiday identification, prior-year loading, parity
└── physicianConsecutiveWeekRules.ts - Physician-specific consecutive week overrides

convex/functions/
└── masterCalendar.ts        - autoAssignCurrentFiscalYearDraft integration

src/components/admin/
├── auto-fill-config-panel.tsx       - Weight sliders, holiday config, prior-year selector
├── auto-fill-metrics-card.tsx       - Quality metrics display
├── auto-fill-decision-log.tsx       - Transparency log table
└── prior-year-holiday-summary.tsx   - Prior FY holiday assignments
```

### Data Flow

```
Admin clicks "Auto-Fill"
    ↓
Load context (weeks, rotations, physicians, preferences, holidays, prior-year data)
    ↓
Load auto-fill config (weights, major holidays, min gap weeks)
    ↓
Compute holiday parity scores (penalize physicians who worked same holiday last year)
    ↓
Run solver (3 passes)
    ↓
Persist assignments + decision log
    ↓
Return metrics
    ↓
UI displays: filled count, avg score, holiday parity score, unfilled cells
```

## Implementation Details

### 1. Schema Changes

Added three new tables and one field:

```typescript
// convex/schema.ts

// Link fiscal years for prior-year holiday context
fiscalYears: defineTable({
  // ... existing fields
  previousFiscalYearId: v.optional(v.id("fiscalYears")), // NEW
})

// Algorithm configuration per fiscal year (admin-tunable weights)
autoFillConfig: defineTable({
  fiscalYearId: v.id("fiscalYears"),
  weightPreference: v.number(),      // default: 30
  weightHolidayParity: v.number(),   // default: 25
  weightWorkloadSpread: v.number(),  // default: 20
  weightRotationVariety: v.number(), // default: 15
  weightGapEnforcement: v.number(),  // default: 10
  majorHolidayNames: v.array(v.string()), // ["Thanksgiving Day", "Christmas Day"]
  minGapWeeksBetweenStints: v.number(),   // default: 2
  updatedAt: v.number(),
  updatedBy: v.optional(v.id("physicians")),
})
  .index("by_fiscalYear", ["fiscalYearId"]),

// Decision log for admin transparency
autoFillDecisionLog: defineTable({
  masterCalendarId: v.id("masterCalendars"),
  weekId: v.id("weeks"),
  rotationId: v.id("rotations"),
  selectedPhysicianId: v.id("physicians"),
  score: v.number(),
  scoreBreakdown: v.string(),         // JSON: { preference, holidayParity, ... }
  alternativesConsidered: v.number(), // how many candidates were eligible
  passNumber: v.number(),             // which pass assigned this cell (1, 2, or 3)
  createdAt: v.number(),
})
  .index("by_calendar", ["masterCalendarId"])
  .index("by_calendar_week", ["masterCalendarId", "weekId"]),

// Track assignment source for undo support
assignments: defineTable({
  // ... existing fields
  assignmentSource: v.optional(v.union(
    v.literal("auto"),    // placed by auto-fill algorithm
    v.literal("manual"),  // placed by admin manually
    v.literal("import")   // imported from spreadsheet
  )),
})
```

### 2. Core Types and Configuration

```typescript
// convex/lib/autoFill.ts

export interface AutoFillConfig {
  weightPreference: number;
  weightHolidayParity: number;
  weightWorkloadSpread: number;
  weightRotationVariety: number;
  weightGapEnforcement: number;
  majorHolidayNames: string[];
  minGapWeeksBetweenStints: number;
}

export const DEFAULT_AUTO_FILL_CONFIG: AutoFillConfig = {
  weightPreference: 30,
  weightHolidayParity: 25,
  weightWorkloadSpread: 20,
  weightRotationVariety: 15,
  weightGapEnforcement: 10,
  majorHolidayNames: ["Thanksgiving Day", "Christmas Day"],
  minGapWeeksBetweenStints: 2,
};

export interface ScoreBreakdown {
  preference: number;          // 0-100
  holidayParity: number;       // 0-100
  workloadSpread: number;      // 0-100
  rotationVariety: number;     // 0-100
  gapEnforcement: number;      // 0-100
  deprioritize: number;        // 0 or 100
}

export interface ScoredCandidate {
  physicianId: string;
  totalScore: number;          // weighted average of dimensions
  breakdown: ScoreBreakdown;   // individual dimension scores
  availability: Availability;  // green | yellow | red
  headroom: number;            // cFTE headroom remaining
}
```

### 3. Holiday Awareness and Parity

```typescript
// convex/lib/autoFillHolidays.ts

/**
 * Build a map of weekId -> holidayName[] for all approved federal holidays
 */
export function identifyHolidayWeeks(
  calendarEvents: CalendarEvent[],
  majorHolidayNames: string[],
): Map<string, string[]> {
  const majorSet = new Set(majorHolidayNames.map((n) => n.toLowerCase()));
  const map = new Map<string, string[]>();

  for (const event of calendarEvents) {
    if (!event.isApproved) continue;
    if (event.category !== "federal_holiday") continue;
    if (!majorSet.has(event.name.toLowerCase())) continue;

    const existing = map.get(event.weekId) ?? [];
    existing.push(event.name);
    map.set(event.weekId, existing);
  }

  return map;
}

/**
 * Build map of holidayName -> physicianId[] showing who worked each holiday last year
 */
export function buildPriorYearHolidayMap(
  priorAssignments: PriorYearAssignment[],
  priorHolidayWeeks: Map<string, string[]>,
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const weekPhysicians = new Map<string, Set<string>>();

  for (const a of priorAssignments) {
    if (!a.physicianId) continue;
    let set = weekPhysicians.get(a.weekId);
    if (!set) {
      set = new Set<string>();
      weekPhysicians.set(a.weekId, set);
    }
    set.add(a.physicianId);
  }

  for (const [weekId, holidays] of priorHolidayWeeks.entries()) {
    const physicians = weekPhysicians.get(weekId);
    if (!physicians) continue;
    for (const holiday of holidays) {
      result.set(holiday, [...physicians]);
    }
  }

  return result;
}

/**
 * Compute parity scores: penalize physicians who worked same holiday last year
 */
export function computeHolidayParityScores(
  majorHolidayNames: string[],
  priorYearHolidayAssignments: Map<string, string[]>,
  currentYearCandidates: string[],
): Map<string, Map<string, number>> {
  const parityScores = new Map<string, Map<string, number>>();

  for (const physicianId of currentYearCandidates) {
    const holidayScores = new Map<string, number>();

    for (const holiday of majorHolidayNames) {
      const priorWorkers = priorYearHolidayAssignments.get(holiday) ?? [];
      if (priorWorkers.includes(physicianId)) {
        holidayScores.set(holiday, -50); // Penalty for working same holiday
      } else {
        holidayScores.set(holiday, 0);
      }
    }

    parityScores.set(physicianId, holidayScores);
  }

  return parityScores;
}
```

**Example**: If JCR worked Thanksgiving last year, their parity score for Thanksgiving week this year is -50, making other physicians more likely to be selected.

### 4. Multi-Dimensional Scoring Engine

```typescript
// convex/lib/autoFillScorer.ts

export function scoreCandidate(params: ScoreCandidateParams): ScoredCandidate {
  const { physician, rotation, week, preferences, context } = params;
  const { config } = context;

  // 1. Week preference scoring (green=100, yellow=40) scaled by rank
  const preference = scorePreference(physician.availability, preferences.preferenceRank);

  // 2. Holiday parity: penalize physicians who worked this holiday last year
  const holidayParity = scoreHolidayParity(
    physician.physicianId,
    week.holidayNames,
    context.parityScores
  );

  // 3. Workload spread: bonus for physicians with fewer total assigned weeks
  const workloadSpread = scoreWorkloadSpread(
    physician.physicianId,
    context.weekCountByPhysician,
    context.totalWeeksToFill,
    context.totalPhysicians,
    context.targetCfteMap,
    context.avgTargetCfte,
  );

  // 4. Rotation variety: bonus if physician hasn't done this rotation recently
  const rotationVariety = scoreRotationVariety(
    physician.physicianId,
    rotation.rotationId,
    context.rotationCountByPhysician,
    context.weekCountByPhysician,
  );

  // 5. Gap enforcement: bonus for larger gaps since last stint
  const gapEnforcement = scoreGapEnforcement(
    physician.physicianId,
    rotation.rotationId,
    week.weekNumber,
    context.lastRotationWeekByPhysician,
    config.minGapWeeksBetweenStints,
  );

  // 6. Deprioritize penalty
  const deprioritize = preferences.deprioritize ? 0 : 100;

  const breakdown: ScoreBreakdown = {
    preference,
    holidayParity,
    workloadSpread,
    rotationVariety,
    gapEnforcement,
    deprioritize,
  };

  // Calculate weighted total score (normalized to 0-100)
  const weightedSum =
    config.weightPreference * preference +
    config.weightHolidayParity * holidayParity +
    config.weightWorkloadSpread * workloadSpread +
    config.weightRotationVariety * rotationVariety +
    config.weightGapEnforcement * gapEnforcement;

  const totalWeight =
    config.weightPreference +
    config.weightHolidayParity +
    config.weightWorkloadSpread +
    config.weightRotationVariety +
    config.weightGapEnforcement;

  const normalizedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const DEPRIORITIZE_PENALTY = 30;
  const totalScore = preferences.deprioritize
    ? Math.max(0, normalizedScore - DEPRIORITIZE_PENALTY)
    : normalizedScore;

  return {
    physicianId: physician.physicianId,
    totalScore,
    breakdown,
    availability: physician.availability,
    headroom: physician.headroom,
  };
}
```

**Example Score**:
- Preference: 100 (green week, rank 1)
- Holiday Parity: 50 (didn't work this holiday last year, so +50 bonus)
- Workload Spread: 80 (has 10 weeks, avg is 12, so bonus)
- Rotation Variety: 70 (only did MICU once before)
- Gap Enforcement: 90 (last MICU was 4 weeks ago, min gap is 2)
- Deprioritize: 100 (not deprioritized)
- **Total Score**: (30×100 + 25×50 + 20×80 + 15×70 + 10×90) / 100 = **82.5**

### 5. Three-Pass Constraint Solver

```typescript
// convex/lib/autoFillSolver.ts

export function runAutoFill(params: RunAutoFillParams): AutoFillResult {
  const { weeks, rotations, physicians, existingAssignments, availabilityMap,
          preferenceMap, targetCfteMap, clinicCfteMap, holidayWeeks,
          parityScores, config, fiscalYearId } = params;

  // Build initial state and tracking maps
  const state = buildSolverState({ weeks, rotations, physicians,
                                   existingAssignments, targetCfteMap, clinicCfteMap });

  // Seeded RNG for deterministic results
  const seed = hashStringToSeed(fiscalYearId);
  const rng = createSeededRng(seed);

  const resultAssignments: AutoFillAssignment[] = [];
  const unfilled: UnfilledCell[] = [];

  // ========================================
  // Pass 1: Scored fill with shuffled order
  // ========================================

  const shuffledCells = seededShuffle([...state.emptyCells], rng);

  for (const cell of shuffledCells) {
    const rotation = rotationsById.get(cell.rotationId);
    const weekNumber = weekNumberById.get(cell.weekId);
    const weekHolidays = holidayWeeks.get(cell.weekId) ?? [];

    // Score all eligible candidates
    const scored = scoreCandidatesForCell({
      cell, rotation, weekNumber, weekHolidays,
      activePhysicians, availabilityMap, preferenceMap,
      targetCfteMap, clinicCfteMap, state, weeks,
      config, parityScores, totalPhysicians, totalWeeksToFill, avgTargetCfte
    });

    if (scored.length === 0) continue;

    // Select highest scoring candidate
    const best = scored[0];
    applyAssignment(state, cell, best, rotation, weekNumber);
    resultAssignments.push({
      weekId: cell.weekId,
      rotationId: cell.rotationId,
      physicianId: best.physicianId,
      score: best.totalScore,
      breakdown: best.breakdown,
      passNumber: 1,
    });
  }

  // ========================================
  // Pass 2: Relaxed fill for remaining cells
  // ========================================

  const remainingCells = state.emptyCells.filter(
    (c) => !resultAssignments.some((a) => a.weekId === c.weekId && a.rotationId === c.rotationId)
  );

  for (const cell of remainingCells) {
    // Try again with relaxed constraints (accept any score > 0)
    const candidates = getHardConstraintCandidates({
      cell, rotation, weekNumber, activePhysicians,
      availabilityMap, preferenceMap, targetCfteMap, clinicCfteMap,
      state, allWeekNumbers, weeks,
    });

    if (candidates.length === 0) {
      unfilled.push({
        weekId: cell.weekId,
        rotationId: cell.rotationId,
        reason: "No eligible physicians after hard constraint filtering"
      });
      continue;
    }

    // Score candidates with relaxed weights (but still use scoring for ordering)
    const scored = candidates.map((c) => scoreCandidate({ /* ... */ }));
    scored.sort((a, b) => b.totalScore - a.totalScore);
    const best = scored[0];

    applyAssignment(state, cell, best, rotation, weekNumber);
    resultAssignments.push({
      weekId: cell.weekId,
      rotationId: cell.rotationId,
      physicianId: best.physicianId,
      score: best.totalScore,
      breakdown: best.breakdown,
      passNumber: 2,
    });
  }

  // ========================================
  // Pass 3: Hill-climbing swap optimization
  // ========================================

  let improved = true;
  let iterations = 0;
  const MAX_SWAP_ITERATIONS = 500;

  while (improved && iterations < MAX_SWAP_ITERATIONS) {
    improved = false;
    iterations++;

    for (let i = 0; i < resultAssignments.length; i++) {
      for (let j = i + 1; j < resultAssignments.length; j++) {
        // Try swapping assignments i and j
        const currentScore = resultAssignments[i].score + resultAssignments[j].score;

        // Check if swap is valid (doesn't violate hard constraints)
        if (!canSwap(resultAssignments[i], resultAssignments[j], state)) continue;

        // Compute new scores after swap
        const swappedScore = computeSwappedScore(i, j, state, /* ... */);

        if (swappedScore > currentScore) {
          performSwap(resultAssignments, i, j, state);
          improved = true;
        }
      }
    }
  }

  // Calculate final metrics
  const metrics = computeMetrics(resultAssignments, unfilled, state, /* ... */);

  return { assignments: resultAssignments, metrics, unfilled };
}
```

### 6. Same-Week Conflict Prevention

Added hard constraint to prevent double-booking physicians in the same week:

```typescript
// convex/lib/autoFill.ts

export function buildWeekToPhysicianMap(
  assignments: Array<{ weekId: string; physicianId: string | null | undefined }>,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const a of assignments) {
    if (!a.physicianId) continue;
    let set = map.get(a.weekId);
    if (!set) {
      set = new Set<string>();
      map.set(a.weekId, set);
    }
    set.add(a.physicianId);
  }
  return map;
}

export function hasWeekConflict(
  weekToPhysicianMap: Map<string, Set<string>>,
  weekId: string,
  physicianId: string,
): boolean {
  const assigned = weekToPhysicianMap.get(weekId);
  return assigned !== undefined && assigned.has(physicianId);
}

// Used in solver as hard constraint filter:
if (hasWeekConflict(state.weekToPhysicianMap, cell.weekId, physician._id)) {
  continue; // Skip this candidate - already assigned this week
}
```

### 7. Undo/Revert Support

```typescript
// convex/functions/masterCalendar.ts

export const clearAutoFilledAssignments = mutation({
  args: {},
  returns: v.object({
    message: v.string(),
    clearedCount: v.number(),
  }),
  handler: async (ctx) => {
    const { fiscalYear } = await getAdminAndCurrentFiscalYear(ctx);
    requireBuildingWindow(fiscalYear);

    const draftCalendar = await getDraftCalendarForFiscalYear(ctx, fiscalYear._id);
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_calendar", (q) => q.eq("masterCalendarId", draftCalendar._id))
      .collect();

    let clearedCount = 0;
    for (const assignment of assignments) {
      if (assignment.assignmentSource === "auto" && assignment.physicianId) {
        await ctx.db.patch(assignment._id, {
          physicianId: undefined,
          assignedBy: undefined,
          assignedAt: undefined,
          assignmentSource: undefined,
        });
        clearedCount++;
      }
    }

    // Clear decision log
    const logEntries = await ctx.db
      .query("autoFillDecisionLog")
      .withIndex("by_calendar", (q) => q.eq("masterCalendarId", draftCalendar._id))
      .collect();
    for (const entry of logEntries) {
      await ctx.db.delete(entry._id);
    }

    return {
      message: `Cleared ${clearedCount} auto-filled assignment(s)`,
      clearedCount,
    };
  },
});
```

### 8. Admin UI Components

**Auto-Fill Config Panel** (`src/components/admin/auto-fill-config-panel.tsx`):
- 5 weight sliders that must sum to 100
- Major holiday name chips (add/remove)
- Min gap weeks input
- Previous FY selector dropdown
- "Reset to Defaults" button
- Saves via `upsertAutoFillConfig` mutation

**Metrics Card** (`src/components/admin/auto-fill-metrics-card.tsx`):
- Displays: filled/unfilled cells, avg score, holiday parity score, cFTE variance, preference satisfaction %
- Color-coded indicators (green/amber/red based on thresholds)
- Expandable detail view

**Decision Log** (`src/components/admin/auto-fill-decision-log.tsx`):
- Searchable table: Week | Rotation | Assigned To | Score | Pass | Alternatives
- Expandable rows show full score breakdown (preference: 100, parity: 50, spread: 80, ...)
- Filter by physician, rotation, pass number, score range

**Prior-Year Holiday Summary** (`src/components/admin/prior-year-holiday-summary.tsx`):
- Read-only display of who worked each major holiday last year
- Shown in config panel for context when tuning parity weights

## Verification

### TypeScript Validation

Both tsconfigs pass with zero errors:
```bash
npm run lint  # tsc -p convex -noEmit && tsc -p . -noEmit && next build
# ✓ Both tsconfigs pass
# ✓ Next.js build succeeds
```

### Test Coverage

Comprehensive test suite with **114 total tests** across 20 test files:

**1. Unit Tests for Scorer** (`tests/autoFillScorer.test.ts` - 8 tests):
- ✓ Preference scoring (green=100, yellow=40, red blocked)
- ✓ Holiday parity scoring (worked last year = -50 penalty)
- ✓ Workload spread scoring (below avg = bonus)
- ✓ Rotation variety scoring (haven't done = bonus)
- ✓ Gap enforcement scoring (larger gap = higher score)
- ✓ Deprioritize penalty (30-point reduction)
- ✓ Edge cases: no prior year data, single physician, all red weeks

**2. Unit Tests for Solver** (`tests/autoFillSolver.test.ts` - 7 tests):
- ✓ Pass 1 (scored fill) assigns highest-scoring candidates
- ✓ Pass 2 (relaxed fill) handles cells that Pass 1 couldn't fill
- ✓ Pass 3 (swap optimization) improves total score
- ✓ Deterministic results verification (same seed = same output)
- ✓ Edge cases: more rotations than physicians, no cFTE headroom

**3. Unit Tests for Holidays** (`tests/autoFillHolidays.test.ts` - 7 tests):
- ✓ Holiday identification from calendar events
- ✓ Prior-year holiday assignment loading
- ✓ Parity score computation (worked last year = penalty)
- ✓ Thanksgiving/Christmas rotation verification

**4. Integration Tests** (`tests/autoFillIntegration.test.ts` - 13 tests):
- ✓ Full pipeline with realistic data (15 physicians, 8 rotations, 52 weeks)
- ✓ Hard constraints verified (red weeks blocked, avoid rotations blocked, cFTE limits enforced)
- ✓ Metrics within acceptable ranges (fill rate >95%, avg score >70, parity >80)
- ✓ Holiday parity enforcement across years (overlap <50% for Thanksgiving/Christmas)
- ✓ Same-week conflict prevention (zero conflicts)
- ✓ High-cFTE scenarios (physicians with 0.80+ targets get proportional assignments)
- ✓ Deterministic output verification (same FY ID = identical results every run)

All tests pass:
```bash
npm run test
# Test Files  20 passed (20)
# Tests       114 passed (114)
# Duration    2.37s
```

### Quality Metrics Achieved

From integration tests with realistic data:
- **Fill rate**: 95%+ of cells filled (unfilled cells < 5%)
- **Holiday parity score**: 80+/100 with prior-year data available
- **Preference satisfaction**: 70%+ assignments on green weeks
- **Workload spread**: Standard deviation < 2 weeks for physicians with similar cFTE targets
- **Same-week conflicts**: Zero (hard constraint enforced)
- **Deterministic**: Same fiscal year ID produces identical results every run

### Git Commits

Six commits implementing the feature end-to-end:
1. `ec0f3d3` - Phase 1: Schema, core types, foundation
2. `261752b` - Phase 2: Multi-dimensional scorer and 3-pass solver
3. `e5f8647` - Phase 2: Integration into autoAssign mutation, clearAutoFilled
4. `423b66a` - Phase 5: 35 tests for scorer, solver, holidays, core utils
5. `7954f6e` - Phase 4: Admin UI for config, metrics, decision log, prior-year summary
6. `16a2f67` - Phase 5: Integration tests for full constraint solver

All quality gates passing:
- `npm run lint` ✓
- `npm run test` ✓ (114/114 tests)
- `npm run test:authz` ✓ (auth guard verification)

## Best Practices

### Multi-Pass Solver Architecture

The 3-pass approach is generalizable to any scheduling/assignment problem:

**Pass 1** (Scored Fill): Handles the "easy" cells with high-scoring candidates. Uses shuffled iteration order to avoid deterministic bias.

**Pass 2** (Relaxed Fill): Handles the "hard" cells that Pass 1 couldn't fill. Accepts any candidate with a positive score.

**Pass 3** (Hill-Climbing): Improves the solution with local search. Swaps pairs of assignments if the swap increases total score.

### Separation of Hard and Soft Constraints

**Hard constraints** filter candidates to zero if violated (boolean check):
- Red weeks
- cFTE limits
- Avoid rotations
- Same-week conflicts
- Max consecutive weeks

**Soft constraints** score candidates in [0, 100] and use weighted sums:
- Preference rank
- Holiday parity
- Workload balance
- Rotation variety
- Gap enforcement

Never mix these—it makes the system unpredictable. Always filter first, score second.

### Deterministic Seeded RNG

Using `hashStringToSeed(fiscalYearId)` ensures reproducibility:
- The same fiscal year always produces the same shuffle order
- Makes debugging and testing easier
- Enables A/B testing different configs with same randomization

Reuse this pattern for any feature that needs randomness but also reproducibility.

### Schema-Driven Validation

Every mutation has `args` and `returns` validators that mirror the schema:
- Provides runtime type safety
- Self-documenting API
- Prevents incorrect data from entering the system

When adding a mutation, always start with the validators.

### Metrics-Driven Optimization

The solver returns not just assignments but also metrics:
- `avgScore`: Overall quality (higher = better)
- `holidayParityScore`: Fairness across years (higher = more fair)
- `cfteVariance`: Workload balance (lower = better)
- `preferencesSatisfied`: % of green week assignments (higher = better)
- `workloadStdDev`: Workload spread (lower = better)

This enables:
- A/B testing different configs
- Tuning weights to optimize specific metrics
- Explaining results to admins
- Tracking quality over time

## Common Pitfalls

### Pitfall 1: Inconsistent hard constraint checking between solver passes

**Problem**: If hard constraints are only checked in Pass 1, Pass 2 or Pass 3 may violate them (e.g., swapping into a red week).

**Solution**: Reuse the same constraint validation functions across all passes:
- Pass 1 & 2: `getHardConstraintCandidates()`
- Pass 3: `canSwap()` which re-checks red weeks, avoid rotations, same-week conflicts

Never duplicate constraint logic—extract to shared functions.

### Pitfall 2: Forgetting to clear decision log when clearing auto-filled assignments

**Problem**: When clearing auto-filled assignments, forgetting to also clear the `autoFillDecisionLog` table leaves stale explanations that don't match the current state.

**Solution**: Always clear both together:
```typescript
// Clear assignments
for (const assignment of assignments) {
  if (assignment.assignmentSource === "auto") {
    await ctx.db.patch(assignment._id, { physicianId: undefined, assignmentSource: undefined });
  }
}

// Also clear decision log
const logEntries = await ctx.db.query("autoFillDecisionLog")
  .withIndex("by_calendar", (q) => q.eq("masterCalendarId", draftCalendar._id))
  .collect();
for (const entry of logEntries) {
  await ctx.db.delete(entry._id);
}
```

### Pitfall 3: Floating-point precision in cFTE calculations

**Problem**: `targetCfte - (clinicCfte + rotationCfte)` can produce values like `0.0000001` due to floating-point arithmetic, causing false "headroom exceeded" errors.

**Solution**: Use `CFTE_EPSILON = 0.000001` for all cFTE comparisons:
```typescript
const CFTE_EPSILON = 0.000001;
if (headroom + CFTE_EPSILON < rotation.cftePerWeek) continue;
```

Also use `round4()` helper for display values to avoid showing `0.2999999999`.

### Pitfall 4: Not handling anchored assignments in swap optimization

**Problem**: Pass 3 optimization should only swap cells that were auto-filled, not those manually placed by admin. Swapping manual assignments breaks admin intent.

**Solution**: Always check `assignmentSource` before allowing swaps:
```typescript
if (existingAssignment?.physicianId && existingAssignment.assignmentSource !== "auto") {
  continue; // Skip anchored assignments (manual or imported)
}
```

### Pitfall 5: Not normalizing holiday names

**Problem**: "Christmas Day" vs "Christmas day" vs "christmas day" are treated as different holidays, breaking parity tracking.

**Solution**: Always normalize to lowercase when comparing:
```typescript
const majorSet = new Set(majorHolidayNames.map((n) => n.toLowerCase()));
if (!majorSet.has(event.name.toLowerCase())) continue;
```

## Related Documentation

- **Plan**: `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/docs/plans/2026-02-17-feat-smart-calendar-auto-fill-plan.md`
- **Schema**: `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/convex/schema.ts`
- **Solver**: `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/convex/lib/autoFillSolver.ts`
- **Scorer**: `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/convex/lib/autoFillScorer.ts`
- **Holidays**: `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/convex/lib/autoFillHolidays.ts`
- **Integration**: `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/convex/functions/masterCalendar.ts`
- **Tests**: `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/tests/autoFill*.test.ts`
- **UI Components**: `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/components/admin/auto-fill-*.tsx`

## Future Enhancements

1. **Performance optimization for 100+ physicians**: Pre-compute eligibility maps, use priority queues, parallelize Pass 3 swaps
2. **Extended decision log**: Record rejected candidates, conflict resolutions, tie-breaking details
3. **Version control for configs**: Snapshot config on publish to enable "replay" with historical settings
4. **Multi-week rotations**: Support rotations that span 2+ consecutive weeks (e.g., 2-week MICU stints)
5. **Team-based constraints**: Support rotations requiring multiple physicians together (e.g., 2-person MICU teams)
6. **Seasonal constraints**: Support rotations that only run in specific months (e.g., summer fellow supervision)
7. **Physician-specific overrides**: Extend `physicianConsecutiveWeekRules` pattern to support per-physician rotation rules
8. **A/B testing framework**: Compare multiple config sets side-by-side to optimize weights empirically
