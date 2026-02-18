---
status: pending
priority: p2
issue_id: "024"
tags: [code-review, calendar, simplicity, dead-code]
---

# `RotationAccent.text` field unused + `deriveFiscalMonths` not used in `month-detail.tsx`

## Problem Statement
Two YAGNI violations in the new calendar code:

1. `RotationAccent.text` is defined in the type and populated across all 10 `ROTATION_ACCENTS` entries, but `accent.text` is never referenced anywhere in the codebase. 10 lines of Tailwind class strings carry zero load.

2. `deriveFiscalMonths` was extracted to `calendar-grid-utils.ts` specifically to avoid duplication, but `month-detail.tsx` still contains an inline re-implementation (lines 82–94) that is byte-for-byte identical. The extraction is half-applied.

## Findings
- `calendar-legend.tsx` line 14: `text: string` in `RotationAccent` type — zero usages via grep
- `calendar-legend.tsx` lines 22–31: all 10 entries populate `text` field — dead data
- `month-detail.tsx` lines 82–94: inline `deriveFiscalMonths` re-implementation instead of calling the exported function

## Proposed Solutions

### Option A: Delete both (Recommended)
**Effort:** Trivial | **Risk:** Low
1. Remove `text` from `RotationAccent` type and all 10 array entries in `ROTATION_ACCENTS`
2. Replace inline `useMemo` in `month-detail.tsx` with `useMemo(() => deriveFiscalMonths(grid), [grid])`

## Acceptance Criteria
- [ ] `RotationAccent` has 3 fields: `borderL`, `dot`, `subtleBg` — no `text`
- [ ] All 10 `ROTATION_ACCENTS` entries updated
- [ ] `month-detail.tsx` uses `deriveFiscalMonths(grid)` instead of inline implementation
- [ ] `deriveFiscalMonths` imported from `calendar-grid-utils.ts` in `month-detail.tsx`

## Work Log
2026-02-17 — Identified by simplicity-reviewer + typescript-reviewer agents.
