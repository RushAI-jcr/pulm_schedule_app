---
status: complete
priority: p2
issue_id: "021"
tags: [code-review, calendar, simplicity, typescript]
---

# `exportPhysicianId` duplicates `filteredPhysicianId` — dead memo + unsafe Id cast

## Problem Statement
`calendar/page.tsx` has two `useMemo` hooks with identical logic, identical dependency arrays, and identical return values: `filteredPhysicianId` and `exportPhysicianId`. The only difference is their names and comments. Additionally, both cast `selectedPhysicianId: string | null` as `Id<"physicians">` which is unsafe — if the string is malformed, the cast succeeds silently.

## Findings
- `calendar/page.tsx` lines 89–98: `filteredPhysicianId` and `exportPhysicianId` are byte-for-byte identical
- Both cast `selectedPhysicianId as Id<"physicians">` — no validation
- `exportPhysicianId` is passed to `IcsExportButton` as `forPhysicianId`

## Proposed Solutions

### Option A: Delete exportPhysicianId, pass filteredPhysicianId (Recommended)
**Effort:** Trivial | **Risk:** Low
Pass `filteredPhysicianId` as the `forPhysicianId` prop to `IcsExportButton`. Remove the `exportPhysicianId` memo entirely.

### Option B: Fix the cast (complementary)
Store `selectedPhysicianId` as `Id<"physicians"> | null` from the point of selection, derived from the typed `physicianOptions` array. Eliminates the cast entirely.

## Acceptance Criteria
- [ ] Only one useMemo for the effective physician ID
- [ ] `IcsExportButton` receives `filteredPhysicianId` directly
- [ ] No duplicate identical useMemo blocks

## Work Log
2026-02-17 — Identified by simplicity-reviewer + typescript-reviewer agents.
