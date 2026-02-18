---
status: pending
priority: p2
issue_id: "017"
tags: [code-review, calendar, architecture, ssr]
---

# `scrollToMonth` DOM side-effect in pure-function utils module — SSR hazard

## Problem Statement
`calendar-grid-utils.ts` is a `.ts` file with no `"use client"` directive. All other exports are pure data-transform functions. `scrollToMonth` references `document.getElementById` — a browser-only API. In Next.js 15 App Router, any server component that imports even one pure function from this file will transitively pull in the `document` reference and throw during SSR. Currently no server component imports this file, but the unsafe pattern will break if any pure util from this file is ever needed in a server context.

## Findings
- `calendar-grid-utils.ts` line 92: `export function scrollToMonth` references `document`
- No `"use client"` directive in `calendar-grid-utils.ts`
- Only call site: `calendar/page.tsx` line 12 imports it

## Proposed Solutions

### Option A: Move scrollToMonth to calendar/page.tsx (Recommended)
**Effort:** Trivial | **Risk:** Low
It has one call site. Inline it as a local function or module-level helper in `calendar/page.tsx` (which is already `"use client"`). Remove the import from `calendar-grid-utils.ts`.

### Option B: Create calendar-scroll.ts with "use client" semantics
**Effort:** Small | **Risk:** Low
`src/components/calendar/calendar-scroll.ts` — a dedicated file for browser navigation helpers. More organized if more scroll utilities are added.

## Acceptance Criteria
- [ ] `calendar-grid-utils.ts` contains only pure functions with no `document`/`window` references
- [ ] `scrollToMonth` is accessible to its only call site
- [ ] No SSR crash risk from importing calendar utilities

## Work Log
2026-02-17 — Identified by architecture-strategist + typescript-reviewer agents during code review of `feat/calendar-visual-overhaul`.
