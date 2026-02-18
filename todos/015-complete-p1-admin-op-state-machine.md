---
status: complete
priority: p1
issue_id: "015"
tags: [code-review, admin-calendar, frontend-race, state]
---

# Four independent boolean flags allow concurrent auto-fill + publish mutations

## Problem Statement
`admin/calendar/page.tsx` tracks four separate boolean loading states: `isCreating`, `isAutoAssigning`, `isClearing`, `isPublishing`. These are independent — nothing prevents Auto-Fill from running while Publish is in-flight. These mutations are not safe to run concurrently: auto-assign writes assignments, publish freezes the calendar. If auto-assign lands after publish (network jitter), the published schedule will contain different data than what the admin reviewed. Convex backend validation does not prevent this because each mutation checks the draft status independently at its own transaction time.

## Findings
- `admin/calendar/page.tsx` lines 56–63: four separate boolean flags
- Each handler only disables its own button — no cross-operation exclusion
- A fast-clicking admin can trigger "Auto-Fill" then immediately "Publish" before auto-fill resolves

## Proposed Solutions

### Option A: Single opState enum (Recommended)
**Effort:** Small | **Risk:** Low
```ts
type OpState = "idle" | "creating" | "auto_assigning" | "clearing" | "publishing"
const [opState, setOpState] = useState<OpState>("idle")

// Every handler:
if (opState !== "idle") return
setOpState("auto_assigning")
try { await autoAssign({}) } finally { setOpState("idle") }
```
All action buttons disable when `opState !== "idle"`. No combinatorial state bugs.

### Option B: Single `isLoading` boolean
**Effort:** Trivial | **Risk:** Low
Simpler but loses the ability to show which operation is in progress in the UI.

## Acceptance Criteria
- [ ] Only one admin operation can run at a time
- [ ] All action buttons (Auto-Fill, Clear, Publish, Create Draft) are disabled while any operation is in-flight
- [ ] Error state is preserved and shown after operation failure
- [ ] Individual loading spinners still show the correct operation name

## Work Log
2026-02-17 — Identified by frontend-races-reviewer agent during code review of `feat/calendar-visual-overhaul`.
