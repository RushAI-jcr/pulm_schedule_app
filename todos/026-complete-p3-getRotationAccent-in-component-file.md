---
status: complete
priority: p3
issue_id: "026"
tags: [code-review, calendar, architecture, organization]
---

# `getRotationAccent` and `ROTATION_ACCENTS` live in a `"use client"` component file

## Problem Statement
`getRotationAccent` is a pure utility function with no JSX or browser dependencies. It is defined in `calendar-legend.tsx` — a `"use client"` component file — but is imported by `admin/calendar/page.tsx` and `month-detail.tsx` which have no rendering relationship to `CalendarLegend`. If server components ever need the accent palette (print stylesheet, email notifications, server-side ICS color hints), they cannot import from a `"use client"` file.

## Findings
- `calendar-legend.tsx`: exports both `CalendarLegend` component AND `getRotationAccent` / `ROTATION_ACCENTS`
- `admin/calendar/page.tsx`: imports `getRotationAccent` from component file for a non-component use case
- `month-detail.tsx`, `year-month-stack.tsx`: same pattern

## Proposed Solutions

### Option A: Move to calendar-tokens.ts (Recommended)
**Effort:** Small | **Risk:** Low
Create `src/components/calendar/calendar-tokens.ts` (no `"use client"`) containing `RotationAccent` type, `ROTATION_ACCENTS`, and `getRotationAccent`. Update `calendar-legend.tsx` to import from there. All other consumers also import from `calendar-tokens.ts`.

### Option B: Move to calendar-grid-utils.ts
**Effort:** Trivial | **Risk:** Low
Add the palette to the existing utils file. Slightly less organized but fewer files.

## Acceptance Criteria
- [ ] `getRotationAccent` in a non-component `.ts` file
- [ ] No `"use client"` dependency for palette access
- [ ] `CalendarLegend` still exports correctly after import change

## Work Log
2026-02-17 — Identified by architecture-strategist agent.
