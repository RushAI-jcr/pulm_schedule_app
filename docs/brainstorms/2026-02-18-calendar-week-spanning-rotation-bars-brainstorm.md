# Calendar Week-Spanning Rotation Bars

**Date:** 2026-02-18
**Author:** Claude (with JCR)
**Status:** Brainstorm → Ready for Planning

---

## What We're Building

Transform rotation assignment display from small inline pills to **week-spanning horizontal bars** that visually emphasize Monday-Sunday continuous coverage. Each rotation assignment will render as a full-width colored bar spanning all 7 day columns, stacked vertically within each week row.

### Current State

**Year View** ([src/components/calendar/year-month-stack.tsx:193-237](src/components/calendar/year-month-stack.tsx#L193-L237)):
```
Mon 3    Tue 4    Wed 5    Thu 6    Fri 7    (Sat/Sun hidden or minimal)
[MICU 1 - JCR] [Pulm - ABC]  ← small pills, wrapping flex container
```

**Problems:**
- Rotations feel like tags/labels, not calendar events
- Weekends aren't visually emphasized
- Doesn't match mental model of "24/7 clinical coverage"
- Hard to scan for rotation patterns at-a-glance
- Small pill size doesn't convey importance of assignments

### Target State

```
Mon 2    Tue 3    Wed 4    Thu 5    Fri 6    Sat 7    Sun 8
┌──────────────────────────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓ MICU 1 - JCR ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ ← teal bar
├──────────────────────────────────────────────────────────┤
│ ▓▓▓▓▓▓▓▓▓▓▓ Pulm - ABC ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ ← violet bar
└──────────────────────────────────────────────────────────┘
```

**Benefits:**
- ✅ Rotations become primary visual element (correct hierarchy)
- ✅ Weekend inclusion is natural and obvious
- ✅ Aligns with calendar app mental model (Gmail Calendar, Outlook)
- ✅ Easier to scan: "Where are my MICU weeks?"
- ✅ Visual weight matches importance of 24/7 coverage

---

## Why This Approach

### User Mental Model Alignment

Physicians think of rotation assignments as **scheduled events** (like meetings or shifts), not tags. Clinical rotations are:
- 24/7 continuous coverage (Monday 00:00 → Sunday 23:59)
- Multi-day commitments (7 consecutive days)
- Mutually exclusive per week (can't be on two inpatient services simultaneously)

Current pill design fails to communicate these properties. Week-spanning bars match how rotations actually work.

### Design System Consistency

The app already exports rotation assignments as **ICS calendar events** ([src/shared/services/masterCalendarExport.ts](src/shared/services/masterCalendarExport.ts)):
```typescript
DTSTART: Monday 00:00
DTEND: Sunday 23:59
SUMMARY: MICU 1 - Jane Doe
```

The UI should visually match what the export produces. When physicians import to Outlook/Google Calendar, they see week-long event blocks — the app calendar should show the same.

### Visual Hierarchy Fix

**Current hierarchy** (what the UI emphasizes):
1. Day numbers (largest, boldest)
2. Event dots (holidays/conferences)
3. Rotation pills (smallest, least prominent)

**Correct hierarchy** (what physicians need):
1. Rotation assignments (primary information)
2. Week boundaries and dates (contextual)
3. Holidays/conferences (secondary)

Week-spanning bars invert the hierarchy correctly.

---

## Key Decisions

### Decision 1: Scope — Year + Month Views (Not Admin Grid)

**What to change:**
- ✅ Year View ([src/components/calendar/year-month-stack.tsx](src/components/calendar/year-month-stack.tsx))
- ✅ Month View ([src/components/calendar/month-detail.tsx](src/components/calendar/month-detail.tsx))

**What to keep as-is:**
- ❌ Admin Calendar Grid ([src/app/(authenticated)/admin/calendar/page.tsx](src/app/(authenticated)/admin/calendar/page.tsx))

**Rationale:**
- Year + Month are **viewing tools** for physicians (read-only calendar display)
- Admin grid is an **editing tool** (spreadsheet paradigm for assignment)
- Different jobs need different UX patterns
- Physicians need calendar-app UX; admins need spreadsheet-cell editing

### Decision 2: Implementation Strategy — Enhanced Pills (Hybrid)

**Chosen Approach:** "Approach 2" from analysis

**Keep:**
- Current 7-column day grid structure (Mon-Sun)
- Current day number display above rotation area
- Current event dot system (holidays/conferences)
- Current month/week grid utilities ([src/components/calendar/calendar-grid-utils.ts](src/components/calendar/calendar-grid-utils.ts))

**Change:**
- Transform rotation pills → full-width horizontal bars
- Use CSS Grid or Flexbox to span bars across all 7 columns
- Stack bars vertically (one per rotation per week)
- Increase visual weight (padding, background opacity, borders)

**Why hybrid over full refactor:**
- ✅ Preserves existing grid infrastructure (less refactoring)
- ✅ Maintains event dot logic and day-number display
- ✅ Easier mobile adaptation (bars stack naturally)
- ✅ Incremental implementation path (month → year)
- ✅ Can iterate based on user feedback without massive rollback

**Rejected alternatives:**
- Full layout restructure (Approach 1): Too complex, high risk
- List-based week cards (Approach 3): Loses month-at-a-glance context

### Decision 3: Visual Design — Colored Bars with Left Accent

**Bar styling:**
- Full-width horizontal block (100% of 7-column grid width)
- Subtle background color (existing `subtleBg` from [calendar-tokens.ts](src/components/calendar/calendar-tokens.ts))
- 4px left border accent (rotation color: teal, violet, amber, etc.)
- Padding: `py-2 px-3` (larger than current pills)
- Border radius: `rounded-md` (softer than current `rounded-sm`)
- Typography: `text-sm font-medium` for rotation name, `text-xs text-muted-foreground` for initials

**Color system:**
- Reuse existing `getRotationAccent()` function (10 rotation colors)
- Same color mapping as current pills (teal → MICU 1, violet → Pulm, etc.)
- Maintain legend consistency ([src/components/calendar/calendar-legend.tsx](src/components/calendar/calendar-legend.tsx))

**Dimming/filtering:**
- Preserve current behavior: dim non-selected physicians (`opacity-30`)
- Highlight current user's assignments (optional colored dot indicator)

### Decision 4: Weekend Display — Always Visible

**Change:** Saturday and Sunday columns always render in year/month views

**Current behavior:**
- Desktop: 7 columns shown, but Sat/Sun less prominent
- Mobile: Vertical cards, weekends mentioned in date range but not as columns

**New behavior:**
- Desktop: Full 7-column grid (Mon-Sun equally weighted)
- Mobile: Same vertical card pattern, but bars visually span "full week"
- Day numbers visible for Sat/Sun (same size as weekdays)

**Rationale:** Clinical rotations are 24/7. Hiding weekends contradicts reality.

### Decision 5: Layout Structure — Week Rows with Stacked Bars

**Desktop grid structure:**
```html
<div class="week-row">
  <!-- Day number header row -->
  <div class="day-grid grid grid-cols-7">
    <div>Mon 2</div>
    <div>Tue 3</div>
    ...
    <div>Sun 8</div>
  </div>

  <!-- Rotation bars (stacked vertically) -->
  <div class="rotation-bars flex flex-col gap-1.5">
    <div class="bar teal-accent">MICU 1 - JCR</div>
    <div class="bar violet-accent">Pulm - ABC</div>
  </div>
</div>
```

**Key points:**
- Day numbers in separate row (above bars)
- Bars stack vertically in flex column
- Each bar spans full width of day grid
- Gap between bars: `gap-1.5` (current pill gap)

### Decision 6: Event Dots — Keep Below Day Numbers

**Event display unchanged:**
- Small colored dots (1.5px diameter) below day numbers
- Rose (federal holiday), Sky (conference), Amber (observance)
- Event name tags render in separate row below bars (if space permits)

**Reasoning:**
- Events are contextual information, not primary
- Dots don't interfere with bar layout
- Existing event logic ([year-month-stack.tsx:238-261](src/components/calendar/year-month-stack.tsx#L238-L261)) works as-is

### Decision 7: Mobile Adaptation — Vertical Stacking

**Mobile layout (< 768px):**
```html
<div class="week-card">
  <div class="week-header">Week 22 • Feb 2-8, 2026</div>
  <div class="rotation-bars flex flex-col gap-2">
    <div class="bar teal-accent">MICU 1 - JCR</div>
    <div class="bar violet-accent">Pulm - ABC</div>
  </div>
</div>
```

**Changes from current mobile:**
- Keep vertical card pattern (already works well)
- Transform pills → bars (same full-width treatment)
- Bars stack with `gap-2` (larger gap for touch targets)
- Week header shows date range (Mon-Sun explicit)

**Unchanged:**
- No day-column grid on mobile (impractical on narrow screens)
- Card-per-week scrolling behavior

### Decision 8: Phased Rollout

**Phase 1: Month View**
- Lower complexity (single month = ~4-5 week rows)
- Easier to test and validate design
- Get user feedback before year view refactor

**Phase 2: Year View**
- Apply learnings from month view implementation
- Same component structure, scaled to 52 weeks
- Optimize for scrolling performance (virtualization if needed)

**Phase 3 (Optional): Admin Grid**
- Only if users request calendar-block view for editing
- Would require rethinking dropdown-cell editing paradigm
- Not part of initial scope

---

## Resolved Questions

### Q1: Vertical Space Trade-off ✅

**Decision:** **A) Accept increased scrolling** — Real calendar apps (Google Calendar, Apple Calendar) prioritize visual clarity over compactness. Better visual clarity is worth the trade-off. Physicians scroll to relevant months anyway.

### Q2: Event Name Tags Placement ✅

**Decision:** **A) Below bars** — Keeps event names visible and maintains the current pattern. Consistent with existing design.

### Q3: Empty Week Rows ✅

**Decision:** **A) Show placeholder bar** — "No clinical rotations" in gray. Makes every week visible and consistent height, just like real calendar apps. Prevents confusion about whether data is missing vs truly empty.

### Q4: Multi-Physician Filter View ✅

**Decision:** **A) Hide non-matching bars entirely** — Clean and focused, just like filtering in Google Calendar. When filtering to specific physicians, only show their assignments.

---

## Technical Approach (High-Level)

### Files to Modify

1. **[src/components/calendar/year-month-stack.tsx](src/components/calendar/year-month-stack.tsx)**
   - Lines 193-237: Replace pill rendering with bar rendering
   - Update grid structure: day headers + bar stack
   - Add CSS Grid or Flexbox for full-width bars

2. **[src/components/calendar/month-detail.tsx](src/components/calendar/month-detail.tsx)**
   - Apply same bar rendering pattern
   - Ensure consistency with year view styling

3. **[src/components/calendar/calendar-tokens.ts](src/components/calendar/calendar-tokens.ts)** (maybe)
   - Potentially add bar-specific accent classes
   - Or reuse existing `borderL`, `subtleBg`, `dot`

4. **Mobile styles** (Tailwind classes in both components)
   - Adjust breakpoints for bar layout
   - Ensure touch targets are adequate (min 44px height)

### Implementation Pattern

**Current (pill):**
```tsx
<div className="flex flex-wrap gap-1.5">
  {gridRow.cells.map((cell) => (
    <div className="inline-flex items-center gap-1.5 border-l-[3px] rounded-sm px-2 py-0.5">
      <span className="font-semibold">{rotation.abbreviation}</span>
      <span>{cell.physicianInitials}</span>
    </div>
  ))}
</div>
```

**New (bar):**
```tsx
<div className="day-grid grid grid-cols-7 gap-1 mb-2">
  {weekDays.map((day) => (
    <div className="text-center">
      <span className="text-sm font-medium">{day.dayNumber}</span>
      {/* Event dots */}
    </div>
  ))}
</div>

<div className="rotation-bars flex flex-col gap-1.5">
  {gridRow.cells.map((cell) => (
    <div className="flex items-center gap-2 border-l-[4px] rounded-md px-3 py-2 w-full">
      <span className="text-sm font-medium">{rotation.abbreviation}</span>
      <span className="text-xs text-muted-foreground">{cell.physicianInitials}</span>
    </div>
  ))}
</div>
```

### Data Structure Changes

**None required.** Existing `GridRow` and `GridCell` types ([calendar-grid-utils.ts](src/components/calendar/calendar-grid-utils.ts)) already provide:
- Week boundaries (`startDate`, `endDate`)
- Rotation assignments (`cells[]`)
- Physician info (`physicianInitials`, `physicianName`)

Backend queries unchanged. Pure frontend refactor.

### Testing Strategy

1. **Visual regression:** Compare before/after screenshots
2. **Responsive:** Test on mobile (375px), tablet (768px), desktop (1440px)
3. **Filter states:** Test rotation filter, physician filter, "My Calendar" scope
4. **Edge cases:** Empty weeks, many rotations per week (>5), long rotation names
5. **Accessibility:** Verify color contrast ratios (WCAG AA), keyboard navigation

---

## Success Metrics

**Qualitative:**
- Physicians report calendar "feels more like Outlook/Google Calendar"
- Faster visual scanning: "I can quickly find my MICU weeks"
- Weekend inclusion feels natural: "It's obvious rotations are 7 days"

**Quantitative:**
- No increase in page load time (bars vs pills negligible)
- Mobile scroll performance remains smooth (60fps)
- Physician adoption: >80% stay in new bar view (if we add toggle)

**User Feedback:**
- Survey question: "How well does the calendar show your rotation schedule?" (1-5 scale)
- Target: >4.0 average rating (up from baseline)

---

## Dependencies & Constraints

**Dependencies:**
- Existing grid utilities ([calendar-grid-utils.ts](src/components/calendar/calendar-grid-utils.ts))
- Existing color token system ([calendar-tokens.ts](src/components/calendar/calendar-tokens.ts))
- Convex query: `getPublishedCalendarByFiscalYear` (unchanged)

**Constraints:**
- Must maintain filter behavior (rotation, physician, month filters)
- Must support ICS export (no backend changes)
- Must work on mobile (responsive design required)
- Cannot break admin grid (separate component, must stay functional)

**No backend changes required.** Pure frontend refactor.

---

## Out of Scope

❌ Admin calendar grid redesign (stays as spreadsheet)
❌ Adding new rotation types or colors (use existing 10-color palette)
❌ Changing week definition (Mon-Sun fiscal week boundaries)
❌ Multi-week rotation support (all rotations are currently 1-week blocks)
❌ Drag-and-drop editing in physician calendar (editing stays in admin grid)
❌ Real-time collaboration features
❌ Undo/redo for calendar views (read-only for physicians)

---

## Next Steps

1. **Resolve open questions** (Q1-Q4 above) via user feedback or design review
2. **Create detailed implementation plan** using `/workflows:plan`
3. **Prototype in month view** (Phase 1) for validation
4. **User testing** with 3-5 physicians before rolling to year view
5. **Iterate based on feedback**, then implement Phase 2 (year view)

---

## References

- Current implementation: [src/components/calendar/year-month-stack.tsx](src/components/calendar/year-month-stack.tsx)
- Grid utilities: [src/components/calendar/calendar-grid-utils.ts](src/components/calendar/calendar-grid-utils.ts)
- Color tokens: [src/components/calendar/calendar-tokens.ts](src/components/calendar/calendar-tokens.ts)
- ICS export: [src/shared/services/masterCalendarExport.ts](src/shared/services/masterCalendarExport.ts)
- Related brainstorm: [2026-02-17-calendar-visual-overhaul-brainstorm.md](docs/brainstorms/2026-02-17-calendar-visual-overhaul-brainstorm.md)
