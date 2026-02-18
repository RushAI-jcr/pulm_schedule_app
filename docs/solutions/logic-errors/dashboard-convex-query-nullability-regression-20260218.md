---
title: "Dashboard typed refactor nullability regression: aligning Convex query unions"
date: 2026-02-18
module: Dashboard
problem_type: logic_error
component: tooling
symptoms:
  - "`npm run typecheck` failed in `src/features/dashboard/components/App.tsx` after replacing dashboard `any` usage"
  - "TS2322/TS2719 errors showed query bundle props receiving `undefined` and `null` where narrower local types expected concrete values"
  - "TS18047/TS18049 errors appeared on nullable nested fields like `bundle.calendar`, `preference.week`, and selected row lookups"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
tags: [typescript, convex, usequery, nullability, dashboard, type-safety]
status: resolved
category: logic-errors
affected_modules:
  - src/features/dashboard/components/App.tsx
  - todos/037-complete-p2-dashboard-as-any-masks-contract-mismatches.md
related_docs:
  - docs/solutions/logic-errors/convex-backend-audit-type-safety-and-validators.md
  - docs/solutions/feature-implementations/calendar-year-view-visual-overhaul.md
---

# Troubleshooting: Dashboard Typed Refactor Nullability Regression

## Problem

During the dashboard type-safety cleanup (todo `037`), replacing broad `any` annotations surfaced contract mismatches between local TypeScript aliases and actual Convex `useQuery` return unions. The page stopped compiling even though runtime behavior was unchanged.

## Environment

- Module: Dashboard
- Affected component: `src/features/dashboard/components/App.tsx`
- Date solved: 2026-02-18
- Validation commands: `npm run typecheck`, `npm test`

## Symptoms

- `npm run typecheck` failed with clusters like:
  - `TS2322`: bundle props not assignable due to `undefined`
  - `TS2719`: “Two different types with this name exist” around hand-rolled bundle aliases
  - `TS18047` / `TS18049`: object possibly `null`/`undefined`
- Most failures concentrated in dashboard query wiring and downstream JSX maps.

## What Didn't Work

**Attempted solution 1:** Replace `any` with narrower custom aliases immediately across dashboard bundles.
- **Why it failed:** Local aliases assumed non-null/non-undefined data, but Convex query hooks can be `undefined` while loading and sometimes `null` in valid states.

**Attempted solution 2:** Fix only one or two error lines with direct casts.
- **Why it failed:** Cast-only patches hid the underlying union mismatch and left related nullable reads unresolved in effects and render loops.

## Solution

Aligned the component with Convex query contracts instead of forcing narrower local contracts.

1. Preserved a strict top-level loading guard for all required queries.
2. Passed narrowed values only after that guard (using targeted non-null assertions where control flow guarantees readiness).
3. Normalized valid nullable cases explicitly (for example, passing `publishedMasterCalendarBundle ?? null` to viewer dashboard).
4. Made downstream reads null-safe in effects and table rendering.

**Representative fixes:**

```tsx
// Guard + narrowing usage
if (
  loggedInUser === undefined ||
  physicians === undefined ||
  currentFY === undefined ||
  (isAdmin && adminMasterCalendarBundle === undefined)
) {
  return <div>Loading...</div>;
}

<AdminMasterCalendarPage bundle={adminMasterCalendarBundle!} />
```

```tsx
// Nullable nested data handling
if (!selectedWeekId && (currentWeekBundle?.weeks?.length ?? 0) > 0) {
  setSelectedWeekId(String(currentWeekBundle?.weeks?.[0]?._id ?? ""));
}

(myRequestBundle?.weekPreferences ?? []).map((preference) => (
  <td>
    Week {preference.week?.weekNumber ?? "?"}
  </td>
))
```

## Why This Works

Convex query hooks are union-shaped by design: they include “loading” and “not available” states. The regression happened because refactor types modeled only the “data loaded” shape. Reintroducing control-flow narrowing and explicit nullable handling made the code match the real hook contract, so TypeScript can verify correctness without falling back to `any`.

## Prevention

- Derive DTOs from generated Convex return types first; do not hand-narrow away loading/null states.
- Treat `useQuery` data as a union until narrowed by explicit guards.
- Prefer local normalization (`?? null`, optional chaining) over broad casts.
- During large `any` removal passes, run `npm run typecheck` after each subsection (query wiring, effects, render maps) instead of only at the end.
- Keep todo docs updated with concrete failing compiler diagnostics to speed future triage.

## Related Issues

- See also: `docs/solutions/logic-errors/convex-backend-audit-type-safety-and-validators.md`
- See also: `docs/solutions/feature-implementations/calendar-year-view-visual-overhaul.md`
