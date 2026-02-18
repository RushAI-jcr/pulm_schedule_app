---
status: complete
priority: p3
issue_id: "039"
tags: [code-review, calendar, ui-consistency, mobile]
dependencies: []
---

# Restore Mobile Event Category Color Mapping in Year Cards

Mobile annual-view event chips currently collapse multiple event categories into a single fallback color, diverging from desktop category semantics.

## Problem Statement

The desktop year view distinguishes federal holidays, conferences, and other observances with separate color families. The mobile year-card renderer maps only `federal_holiday` explicitly and sends all other categories to a single conference-style color. This weakens category scanning and creates cross-breakpoint inconsistency.

## Findings

- Mobile chip class logic in `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/components/calendar/year-month-stack.tsx:346` only checks `e.category === "federal_holiday"`.
- All non-federal categories fall into one sky-blue branch (`/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/components/calendar/year-month-stack.tsx:349`).
- Desktop logic in the same component keeps a 3-way mapping (federal/conference/other), so mobile behavior is less expressive.

## Proposed Solutions

### Option 1: Match desktop 3-way mapping on mobile

**Approach:** Reuse the same category ternary used in desktop week-event chips for the mobile chip renderer.

**Pros:**
- Immediate consistency across breakpoints
- Minimal refactor

**Cons:**
- Still duplicates category mapping logic in multiple places

**Effort:** Small

**Risk:** Low

---

### Option 2: Extract shared `eventCategoryBadgeClass()` helper

**Approach:** Centralize event-chip class mapping in a pure utility used by both desktop and mobile render paths.

**Pros:**
- Prevents future drift
- Improves maintainability

**Cons:**
- Slightly larger change than direct patch

**Effort:** Small-Medium

**Risk:** Low

## Recommended Action
Implemented Option 2 by extracting a shared `eventCategoryBadgeTone()` helper and reusing it for both desktop and mobile event chips to keep category semantics aligned.

## Technical Details

**Affected files:**
- `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/components/calendar/year-month-stack.tsx:346`
- `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/components/calendar/year-month-stack.tsx:349`

## Resources

- **Review context:** Annual calendar redesign follow-up

## Acceptance Criteria

- [x] Mobile event chips use the same category-color mapping as desktop
- [x] Federal holidays, conferences, and other observances are visually distinct
- [x] No regression in mobile card layout spacing

## Work Log

### 2026-02-18 - Initial Discovery

**By:** Codex

**Actions:**
- Compared desktop vs mobile event-chip class mapping
- Confirmed category collapse in mobile rendering path
- Documented consistency risk and remediation options

**Learnings:**
- Shared visual semantics should be centralized to prevent breakpoint drift.

### 2026-02-18 - Fix Implemented

**By:** Codex

**Actions:**
- Added `eventCategoryBadgeTone(category)` in `year-month-stack.tsx`.
- Replaced duplicated desktop/mobile chip color conditionals with the shared helper.
- Restored 3-way category coloring on mobile (`federal_holiday`, `conference`, `other` bucket).
- Validated with `npm test` (pass).

**Learnings:**
- Centralized style mapping removes future breakpoint drift and keeps semantics consistent.

## Notes

- Non-blocking polish item; improves scanning and design consistency.
