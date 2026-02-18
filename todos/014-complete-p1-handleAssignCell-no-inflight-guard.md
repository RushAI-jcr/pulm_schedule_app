---
status: complete
priority: p1
issue_id: "014"
tags: [code-review, admin-calendar, frontend-race, mutation]
---

# No per-cell in-flight guard on `handleAssignCell` — concurrent mutations possible

## Problem Statement
The admin scheduling grid renders an invisible `<select>` per cell. `onChange` fires `handleAssignCell` which is `async`. Nothing prevents a second `onChange` from firing (rapid change, browser focus/blur replay) before the first `await assignCell()` resolves. Two conflicting mutations for the same cell can be in-flight simultaneously. Convex processes them in arrival order which may differ from user intent. The physician ends up assigned incorrectly with no UI indication.

## Findings
- `admin/calendar/page.tsx` lines 173–183: `handleAssignCell` is async with no guard
- `admin/calendar/page.tsx` line 421–444: invisible `<select>` fires onChange per cell — no per-cell debounce or lock
- `catch {}` block at line 181 is empty — errors are silently swallowed

## Proposed Solutions

### Option A: Per-cell in-flight Set (Recommended)
**Effort:** Small | **Risk:** Low
```tsx
const [inFlightCells, setInFlightCells] = useState<Set<string>>(new Set())

const handleAssignCell = async (weekId: string, rotationId: string, physicianId: string | null) => {
  const key = `${weekId}:${rotationId}`
  if (inFlightCells.has(key)) return
  setInFlightCells((prev) => new Set(prev).add(key))
  try {
    await assignCell({ ... })
  } catch (err) {
    setError(err instanceof Error ? err.message : "Assignment failed")
  } finally {
    setInFlightCells((prev) => { const next = new Set(prev); next.delete(key); return next })
  }
}
```
Disable the select per-cell when `inFlightCells.has(key)`.

### Option B: Debounce per cell
**Effort:** Medium | **Risk:** Low
Use a debounce map per cell key. More complex, adds latency.

## Acceptance Criteria
- [ ] Duplicate `onChange` for same cell within a single mutation's round-trip is dropped
- [ ] Cell is visually disabled while mutation is in-flight
- [ ] Errors are surfaced (not silently swallowed)
- [ ] Multiple different cells can be mutated independently without blocking each other

## Work Log
2026-02-17 — Identified by frontend-races-reviewer agent during code review of `feat/calendar-visual-overhaul`.
