---
status: done
priority: p1
issue_id: "001"
tags: [code-review, data-loss, ux, physicians]
dependencies: []
---

# Edit Physician Dialog Always Resets Week IDs (Silent Data Loss)

## Problem Statement

When an admin opens the "Edit Physician" dialog for a physician who already has `activeFromWeekId` or `activeUntilWeekId` set, both week dropdowns are reset to blank (`""`). If the admin edits any other field (e.g., role or name) and saves without re-selecting the week fields, `updatePhysician` is called with `activeFromWeekId: undefined` and `activeUntilWeekId: undefined`. In Convex, `patch()` with `undefined` values **skips** those fields — so existing week restrictions are silently preserved but the user cannot see or interact with them. Worse, if the admin explicitly wants to *clear* a restriction, there is no way to do so.

## Findings

**Location:** `src/app/(authenticated)/admin/physicians/page.tsx:191-201`

```typescript
const openEditDialog = (physician: PhysicianWithStatus) => {
  setSelectedPhysician(physician)
  setFirstName(physician.firstName)
  // ...
  setActiveFromWeekId("")   // ← always blank, loses existing value
  setActiveUntilWeekId("") // ← same
  setEditDialogOpen(true)
}
```

Root causes:
1. `PhysicianWithStatus` (returned by `listPhysiciansWithStatus`) only includes `activeFromWeekNumber` (integer) and `activeUntilWeekNumber` (integer) — not the actual `_id` values needed to pre-populate the dropdowns.
2. There is no mechanism in `updatePhysician` to explicitly clear a week ID once set (sending `undefined` is a no-op for `patch()`).

## Proposed Solutions

### Option A (Recommended): Return week IDs from listPhysiciansWithStatus + pre-populate dialog

**Changes:**
1. Add `activeFromWeekId: v.optional(v.id("weeks"))` and `activeUntilWeekId: v.optional(v.id("weeks"))` to `listPhysiciansWithStatus` return validator and handler.
2. Update `PhysicianWithStatus` type in the page to include these fields.
3. In `openEditDialog`, initialize week ID state from the physician's existing IDs:
   ```typescript
   setActiveFromWeekId(physician.activeFromWeekId ? String(physician.activeFromWeekId) : "")
   setActiveUntilWeekId(physician.activeUntilWeekId ? String(physician.activeUntilWeekId) : "")
   ```
4. To allow *clearing*, add `clearActiveFromWeek` / `clearActiveUntilWeek` boolean args to `updatePhysician` that explicitly `patch` to `undefined`.

- **Pros:** Fully resolves both the display issue and the clearing issue.
- **Cons:** Slightly more args on `updatePhysician`.
- **Effort:** Medium (~30 min)
- **Risk:** Low

### Option B: Add a separate "Clear Date Restrictions" mutation

Add `clearPhysicianWeekRestrictions` mutation that sets both IDs to `undefined`. Simpler scoping but doesn't fix the pre-populate display.

- **Pros:** Minimal change to existing code.
- **Cons:** Still doesn't show the admin what's currently set when editing.
- **Effort:** Small (~15 min)
- **Risk:** Low

## Recommended Action

Option A — fixes both the display and the clearing gap in one coherent change.

## Technical Details

**Affected files:**
- `convex/functions/physicians.ts` — `listPhysiciansWithStatus` (add week IDs to returns) + `updatePhysician` (add clear args)
- `src/app/(authenticated)/admin/physicians/page.tsx` — `PhysicianWithStatus` type + `openEditDialog` + `handleEdit`

## Acceptance Criteria

- [ ] Edit dialog pre-populates week dropdowns with currently-set values
- [ ] Admin can save physician without re-selecting weeks and no data changes
- [ ] Admin can explicitly clear a week restriction (e.g., select blank/none in dropdown)
- [ ] TypeScript compiles clean on both tsconfigs
- [ ] `listPhysiciansWithStatus` return validator includes week IDs

## Work Log

- 2026-02-17: Identified by TypeScript reviewer (Finding 3, MEDIUM→P1 due to data impact) and agent-native reviewer (Finding 2, CRITICAL). Promoted to P1 because existing week restrictions cannot be managed once set.
