---
status: complete
priority: p1
issue_id: "016"
tags: [code-review, calendar, typescript, architecture]
---

# `GridRow` type defined three times — `ics-export-button.tsx` has divergent private definition

## Problem Statement
There are three separate `GridRow` type definitions: the canonical export in `calendar-grid-utils.ts`, a private wider version in `ics-export-button.tsx` (adds `assignmentId` field that is never consumed), and an implicit structural match in `admin/calendar/page.tsx`. If the Convex backend query shape changes and only the shared type is updated, `ics-export-button.tsx` silently drifts. TypeScript won't catch it because the local type is freestanding.

## Findings
- `calendar-grid-utils.ts` lines 3–14: canonical `GridRow` export (4 cell fields)
- `ics-export-button.tsx` lines 21–27: private `GridRow` with extra `assignmentId: Id<"assignments"> | null` — field is never read in `buildExportData`
- `admin/calendar/page.tsx`: no explicit `GridRow` type — relies on structural inference from Convex

## Proposed Solutions

### Option A: Import shared GridRow everywhere (Recommended)
**Effort:** Small | **Risk:** Low
Delete the private `GridRow` in `ics-export-button.tsx`. Import from `calendar-grid-utils.ts`. If `assignmentId` is needed (it isn't currently), add an optional field to the shared type.

### Option B: Add `assignmentId` to shared GridRow as optional
**Effort:** Small | **Risk:** Low
`assignmentId?: Id<"assignments"> | null` in shared type. Only the ICS export path would use it.

## Acceptance Criteria
- [ ] Single `GridRow` source of truth in `calendar-grid-utils.ts`
- [ ] `ics-export-button.tsx` imports from shared location
- [ ] No `assignmentId` field unless it's actually consumed

## Work Log
2026-02-17 — Identified by architecture-strategist + typescript-reviewer agents during code review of `feat/calendar-visual-overhaul`.
