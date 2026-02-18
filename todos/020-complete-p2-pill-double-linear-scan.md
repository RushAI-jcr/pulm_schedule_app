---
status: complete
priority: p2
issue_id: "020"
tags: [code-review, calendar, performance, typescript]
---

# `rotations.find()` + `rotations.indexOf()` double linear scan per assignment pill

## Problem Statement
Both `year-month-stack.tsx` and `month-detail.tsx` perform two sequential O(n) scans of the `rotations` array per pill render: `find()` to locate the rotation object, then `indexOf()` on the returned reference to recover its index for `getRotationAccent`. This is redundant — `findIndex()` returns both in one pass. Each call also runs `String(r._id)` coercions inside the loop. With 10 rotations × 52 weeks this is minor but the pattern appears in two files and compounds maintenance risk.

## Findings
- `year-month-stack.tsx` lines 188–192: `find()` then `indexOf()` per pill
- `month-detail.tsx` lines 227–231: identical double-scan pattern
- `year-month-stack.tsx` line 307 (mobile path): `rotations.find()` again per week card

## Proposed Solutions

### Option A: findIndex + index access (Recommended)
**Effort:** Small | **Risk:** Low
```ts
const rotIdx = rotations.findIndex((r) => String(r._id) === String(cell.rotationId))
if (rotIdx === -1) return null
const rotation = rotations[rotIdx]
const accent = getRotationAccent(rotIdx)
```
One scan, correct index, no double work. Apply to both files.

### Option B: Pre-built rotation Map via useMemo
**Effort:** Small | **Risk:** Low
```ts
const rotationMap = useMemo(() => {
  const map = new Map<string, { rotation: Rotation; index: number }>()
  rotations.forEach((r, i) => map.set(String(r._id), { rotation: r, index: i }))
  return map
}, [rotations])
```
O(1) lookup per pill. Best for components that re-render frequently with changing filter state.

## Acceptance Criteria
- [ ] Single scan per pill render in both `year-month-stack.tsx` and `month-detail.tsx`
- [ ] Mobile path in `year-month-stack.tsx` also updated
- [ ] Same fix applied consistently to both files

## Work Log
2026-02-17 — Identified by typescript-reviewer + performance-oracle agents during code review of `feat/calendar-visual-overhaul`.
