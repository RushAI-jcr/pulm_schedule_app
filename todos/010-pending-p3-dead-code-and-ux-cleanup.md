---
status: complete
priority: p3
issue_id: "010"
tags: [code-review, quality, simplicity, physicians]
dependencies: []
---

# Dead Code and UX Cleanup: hasConsecutiveWeekPreference + futureAssignments Estimate

## Problem Statement

Two small but clear improvements from the simplicity review:

1. **`hasConsecutiveWeekPreference` is exported but never called anywhere.** Dead API surface.
2. **`futureAssignments` proportional estimate is O(n²) and misleading.** Calls `weeks.find()` inside `weeks.filter()`, and the result (an approximation based on uniform distribution) is shown in the deactivation dialog as "Approximately X assignments" — but this ignores that assignments are non-uniformly distributed, and the actual count is returned in the mutation response anyway.

## Findings

**Finding 1 — Dead export:**
`convex/lib/physicianConsecutiveWeekRules.ts:66-75` — `hasConsecutiveWeekPreference` has zero callers.

**Finding 2 — O(n²) estimate:**
`src/app/(authenticated)/admin/physicians/page.tsx:222-227`
```typescript
const futureAssignments = selectedPhysician && activeUntilWeekId && weeks
  ? weeks.filter((w) => {
      const selectedWeek = weeks.find((week) => String(week._id) === activeUntilWeekId) // ← O(n) inside O(n)
      return selectedWeek && w.weekNumber > selectedWeek.weekNumber
    }).length * (selectedPhysician.assignmentCount / weeks.length) // ← uniform distribution assumption
  : 0
```

## Proposed Solutions

### Fix 1: Delete hasConsecutiveWeekPreference
Remove lines 66-75 from `convex/lib/physicianConsecutiveWeekRules.ts`. Zero callers, logically redundant with `getPhysicianMaxConsecutiveWeeks`.

### Fix 2: Replace estimate with static warning text
Replace the `futureAssignments` computation (6 lines) with static copy in the deactivation dialog:

```tsx
// Remove lines 222-227 entirely
// Change line ~574 from:
"Approximately {futureAssignments} assignment(s) will be cleared."
// To:
"All assignments after this week will be cleared from the draft calendar."
```

The actual count is returned by `deactivatePhysician` and shown in the success toast — no need for a pre-action estimate.

- **Effort:** Trivial (~10 min)
- **Risk:** None

## Acceptance Criteria

- [ ] `hasConsecutiveWeekPreference` removed from `physicianConsecutiveWeekRules.ts`
- [ ] No remaining callers (search confirms)
- [ ] `futureAssignments` state/computation removed from physicians page
- [ ] Deactivation dialog shows static warning text
- [ ] TypeScript clean

## Work Log

- 2026-02-17: Identified by code simplicity agent (items 1 and 2) and TypeScript reviewer (Finding 4/7).
