---
module: Dashboard
date: "2026-02-18"
problem_type: logic_error
component: frontend_stimulus
symptoms:
  - "Legacy dashboard paths used broad `any` typing and `as any` casts around Convex query/mutation payloads"
  - "Contract drift risk moved from compile-time checks to runtime behavior in active admin and physician flows"
  - "Review findings repeatedly flagged the same unsafe typing pattern in App.tsx"
root_cause: logic_error
resolution_type: code_fix
severity: medium
tags: [typescript, convex, dashboard, type-safety, contracts]
---

# Troubleshooting: Dashboard Convex Contract Type Erasure

## Problem
The legacy dashboard component (`src/features/dashboard/components/App.tsx`) used broad `any` typing in high-risk Convex data paths. This bypassed generated API contracts and made payload mismatches difficult to detect before runtime.

## Environment
- Module: Dashboard
- Affected Component: `src/features/dashboard/components/App.tsx`
- Date: 2026-02-18

## Symptoms
- Review findings flagged unsafe typing at repeated hotspots (including around line 1075 in prior revisions).
- Convex contract mismatches could compile, then fail only at runtime.
- Type-safety debt persisted across active admin scheduling/reporting workflows.

## What Didn't Work

**Attempted Solution 1:** Rely on test/typecheck/baseline smoke runs only.  
- **Why it failed:** Passing checks did not remove local `any` escape hatches, so contract safety remained incomplete.

**Attempted Solution 2:** Plan a full legacy dashboard rewrite first.  
- **Why it failed:** Too large for immediate risk reduction; it delayed critical safety improvements in currently used flows.

## Solution
Implemented an incremental typed refactor in the active dashboard paths:

- Added shared Convex return-type aliases (`ConvexReturn<T>`) to bind local UI types to generated API contracts.
- Replaced broad dashboard `any` annotations with explicit DTO/row types for key scheduling, clinic, trade, conference, and admin payloads.
- Tightened helper/component signatures (including typed mutation references in seed controls) to preserve compile-time checks end to end.

**Code changes (representative):**
```ts
type ConvexReturn<T extends { _returnType: unknown }> = T["_returnType"];
type PhysiciansBundle = ConvexReturn<typeof api.functions.physicians.getPhysicians>;

type TradeRow = {
  _id: Id<"tradeRequests">;
  requestingPhysicianId: Id<"physicians">;
  targetPhysicianId: Id<"physicians">;
  requesterWeekLabel: string;
  requesterRotationLabel: string;
  targetWeekLabel: string;
  targetRotationLabel: string;
  requesterName: string;
  targetName: string;
  status: string;
};
```

**Verification commands:**
```bash
rg -n "as any|\\bany\\b" src/features/dashboard/components/App.tsx
npm run typecheck
npm test
```

Result after fix: `src/features/dashboard/components/App.tsx` has `0` `any` occurrences and prior regression checks passed.

## Why This Works
The root issue was type erasure in code paths that should have remained bound to Convex-generated contracts. By replacing broad `any` with concrete types inferred from the API and explicit DTOs, payload shape drift becomes a compile-time error again instead of a runtime surprise. The incremental scope reduced immediate risk while avoiding a destabilizing full rewrite.

## Prevention
- Keep Convex UI integration typed from generated API return types instead of ad-hoc payload casting.
- Reject new broad `any` usage in dashboard feature paths during review.
- Add periodic guard scans for risky patterns (`as any`, untyped mutation/query wrappers) in active modules.
- Continue decomposing the legacy dashboard into smaller typed subcomponents to reduce future drift.

## Related Issues
- See also: `docs/solutions/logic-errors/convex-backend-audit-type-safety-and-validators.md`
- Similar pattern: `todos/032-complete-p3-fiscal-year-status-any-cast-bypasses-type-safety.md`
- Resolution record: `todos/037-complete-p2-dashboard-as-any-masks-contract-mismatches.md`
