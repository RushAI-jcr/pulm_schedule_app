---
status: pending
priority: p2
issue_id: "025"
tags: [code-review, security, ics-export]
---

# ICS export: `escapeIcsText` does not validate Convex ID fields embedded in UID properties

## Problem Statement
The ICS export function embeds Convex-generated IDs (`weekId`, `rotationId`, `physicianId`) directly into the `UID` property of calendar events without character validation. Convex IDs are opaque strings that in practice contain only alphanumeric + underscore characters, but this is not validated before embedding. Additionally, user-controlled strings from the database (`rotationName`, `physicianName`, `event.name`) are passed through `escapeIcsText` which handles line injection but does not strip all ICS structural metacharacters.

## Findings
- `src/shared/services/masterCalendarExport.ts` lines 270–272: Convex IDs in `UID` field without validation
- `escapeIcsText` handles CRLF injection but not all ICS metacharacters
- A compromised admin account could store a rotation/physician name that produces malformed ICS calendar entries

## Proposed Solutions

### Option A: Allowlist validation on ID fields + length cap on text fields (Recommended)
**Effort:** Small | **Risk:** Low
```ts
// Validate Convex ID fields before embedding
function validateConvexId(id: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(id)) throw new Error(`Invalid ID in ICS export: ${id}`)
  return id
}

// Use in UID construction
`UID:${validateConvexId(assignment.weekId)}-${validateConvexId(assignment.rotationId)}@rush-pccm`
```
Add max length cap (255 chars) on text fields per RFC 5545.

### Option B: Hash IDs into the UID
**Effort:** Small | **Risk:** Low
Use a simple hash of the IDs for the UID. Eliminates raw ID embedding entirely.

## Acceptance Criteria
- [ ] Convex ID fields validated as alphanumeric + underscore before ICS embedding
- [ ] Text fields have max-length enforcement
- [ ] Malformed IDs throw rather than silently producing corrupt ICS

## Work Log
2026-02-17 — Identified by security-sentinel agent during code review of `feat/calendar-visual-overhaul`.
