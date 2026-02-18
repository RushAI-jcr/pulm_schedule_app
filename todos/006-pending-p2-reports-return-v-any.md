---
status: complete
priority: p2
issue_id: "006"
tags: [code-review, typescript, type-safety, reports]
dependencies: []
---

# All 5 Report Queries Return v.any() (Breaks End-to-End Type Safety)

## Problem Statement

Every report query in `convex/functions/reports.ts` uses `returns: v.any()`, bypassing Convex's end-to-end type system. This means:
1. The frontend receives `any` for all report data — typos in field names compile silently.
2. No runtime validation of return values — a handler bug that changes the return shape causes silent failures.
3. Violates the CLAUDE.md project convention: "Always include `args` and `returns` validators on all Convex functions."
4. Agents cannot statically reason about report shapes.

## Findings

**Location:** `convex/functions/reports.ts:53, 187, 250, 370, 468`

All five: `getHolidayCoverageReport`, `getRotationDistributionReport`, `getCfteComplianceReport`, `getTradeActivityReport`, `getYearOverYearReport`.

Special cases:
- `getRotationDistributionReport` and `getYearOverYearReport` return `null` when FY not found — need `v.union(v.null(), v.object({...}))`.
- `getCfteComplianceReport` has nullable `targetCfte` and `variance` fields — need `v.union(v.number(), v.null())`.

## Proposed Solutions

### Option A (Recommended): Define typed return validators for all 5 queries

For each query, define the return shape as a `v.object()`. Example for `getCfteComplianceReport`:

```typescript
returns: v.object({
  fiscalYear: v.object({ _id: v.string(), label: v.string() }),
  rows: v.array(v.object({
    physicianId: v.string(),
    physicianInitials: v.string(),
    physicianName: v.string(),
    targetCfte: v.union(v.number(), v.null()),
    actualCfte: v.number(),
    variance: v.union(v.number(), v.null()),
    weekCount: v.number(),
    status: v.union(
      v.literal("no_target"), v.literal("compliant"),
      v.literal("over"), v.literal("under")
    ),
  })),
  summary: v.object({
    compliant: v.number(), over: v.number(),
    under: v.number(), noTarget: v.number(),
  }),
})
```

No handler changes needed — only add the `returns` validator.

- **Pros:** Enforces correctness, restores type inference on frontend, follows project conventions.
- **Effort:** Medium (~1-2 hours for all 5)
- **Risk:** Low (additive, but Convex will validate actual return at runtime and throw if shape mismatches — find bugs early)

### Option B: Keep v.any() temporarily, add frontend TypeScript types

Define manual TypeScript interfaces on the frontend that match the expected shapes. No runtime validation.

- **Pros:** Minimal backend change.
- **Cons:** Still violates CLAUDE.md conventions; no runtime protection.
- **Effort:** Small
- **Risk:** Medium (no runtime enforcement)

## Recommended Action

Option A. The return validators are the correct fix.

## Technical Details

**Affected files:**
- `convex/functions/reports.ts` — replace `returns: v.any()` on all 5 queries with typed validators

## Acceptance Criteria

- [ ] All 5 report queries have explicit `returns` validators (no `v.any()`)
- [ ] `getRotationDistributionReport` and `getYearOverYearReport` use `v.union(v.null(), v.object({...}))`
- [ ] Frontend TypeScript infers correct types from report query results
- [ ] Both tsconfigs compile clean
- [ ] `npm run lint:convex` passes

## Work Log

- 2026-02-17: Identified by TypeScript reviewer (Finding 1, HIGH) and agent-native reviewer (Finding 4). Violates CLAUDE.md convention.
