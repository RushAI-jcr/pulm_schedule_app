# Light Mode Color Palette Redesign

**Date:** 2026-02-18
**Status:** Brainstorm
**Author:** User + Claude

---

## What We're Building

Redesign the light mode color palette to be more visible, pleasant, and modern. Moving away from the current sage-green-heavy Rush branding palette to a Notion-inspired modern indigo theme with better contrast and vibrancy.

### Problems with Current Palette
1. **Poor contrast** - text and elements hard to read against sage backgrounds
2. **Dull/clinical feel** - sage green backgrounds (#F2F6F3) feel institutional
3. **Harsh primary** - dark legacy green (#006332) feels too heavy and severe
4. **Monotonous** - green dominates everything, lacks visual interest

### User Goals
- Better visibility and readability
- Modern, vibrant aesthetic (like Notion)
- Pleasant, not clinical
- Complete freedom from Rush branding constraints

---

## Why This Approach

**Selected: Modern Indigo Palette**

This palette addresses all user concerns:

### Primary Colors
- **Primary:** `#6366F1` (vibrant indigo) - modern, friendly, professional
- **Primary Hover:** `#4F46E5` (deeper indigo)
- **Background:** `#FAFAFA` (soft warm gray) - inviting, not clinical
- **Surface:** `#FFFFFF` (pure white cards) - clean, crisp
- **Text:** `#1F2937` (near-black) - excellent contrast

### Semantic Scheduling Colors
- **Available:** `#10B981` (emerald green)
- **Prefer Not:** `#F59E0B` (amber)
- **Unavailable:** `#EF4444` (red)
- **Success:** `#10B981`
- **Warning:** `#F59E0B`

### Why Indigo?
- Modern and professional without being corporate
- High contrast against light backgrounds
- Vibrant but not harsh or aggressive
- Popular in modern design systems (Tailwind, shadcn)
- Works well with medical/scheduling context
- Differentiates from green-heavy medical stereotypes

### Inspiration: Notion
- Clean, minimal backgrounds (off-white, not stark)
- Vibrant but tasteful accents
- Excellent readability
- Modern, professional, not stuffy
- Good semantic color usage

---

## Key Decisions

### 1. Background Strategy
- **Main background:** `#FAFAFA` (warm gray) replaces sage green
- **Cards/surfaces:** Pure white (`#FFFFFF`)
- **Muted areas:** `#F3F4F6` (gray-100)
- **Borders:** `#E5E7EB` (gray-200) - subtle but visible

### 2. Typography/Text Contrast
- **Primary text:** `#1F2937` (gray-900) - WCAG AAA compliance
- **Secondary text:** `#6B7280` (gray-500)
- **Muted text:** `#9CA3AF` (gray-400)
- Much stronger contrast than current sage/green tones

### 3. Semantic Color Philosophy
- **Keep green for "available"** - positive, go-ahead association
- **Amber for warnings/prefer-not** - caution without alarm
- **Red for unavailable/errors** - clear negative signal
- **Indigo for actions** - primary buttons, links, focus states

### 4. Remove Rush Branding
- No more legacy green (#006332)
- No more sage backgrounds
- No more green-tinted text
- Keep gold/cerulean as potential accent options but not primary

### 5. Gradients (Optional Enhancement)
- Current: radial gradients with cerulean + digital sage
- **New approach:** Either remove for cleaner look OR use subtle indigo/purple gradients
- Decision deferred to implementation phase

---

## Implementation Scope

### Files to Modify
1. **`src/index.css`**
   - Update `:root` CSS variables for light mode
   - Replace all sage/green HSL values with new palette
   - Update `--background`, `--primary`, `--foreground`, etc.
   - Update Rush custom properties (or remove if unused)
   - Update/remove decorative gradients

2. **`tailwind.config.js`**
   - Update `rush` color aliases (or remove entirely)
   - Keep shadcn semantic tokens (they reference CSS vars)
   - Update scheduling semantic colors (available, prefer-not, unavailable)

3. **Components (if needed)**
   - Most components use shadcn tokens, so should inherit automatically
   - May need to update any hardcoded hex values
   - Review auth components (auth-input-field, auth-button classes)

### What NOT to Change
- Dark mode palette (separate effort if needed)
- Component structure/layout
- Typography (Calibre font stack is fine)
- shadcn/ui semantic token architecture

---

## Resolved Questions

### 1. Gradient Treatment ✅
**Decision:** Remove gradients entirely for clean, flat Notion aesthetic

Rationale: Keeps the design clean and modern. Matches Notion's minimal approach. Can always add back if feels too flat during implementation.

### 2. Secondary/Accent Colors ✅
**Decision:** Keep it simple - just indigo + semantic colors

Rationale: Simplicity first. Indigo primary + emerald/amber/red semantic colors provides enough variety. Can add purple tints or warm accents later if needed.

### 3. Border & Shadow Strategy ✅
**Decision:** Notion-style pronounced shadows with lighter borders

Rationale: Pronounced shadows add depth and visual hierarchy. Lighter borders keep things airy and modern. This is a key part of the Notion aesthetic.

**Implementation details:**
- Borders: Light gray (`#E5E7EB` or lighter)
- Shadows: More pronounced than current
  - Cards: `0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)` or similar
  - Elevated: `0 4px 6px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)`
  - Hover states: Slightly deeper shadows for interaction feedback

### 4. Component-Specific Colors
**Note:** Will discover during implementation, but priority areas to review:
- Calendar views (week grid, month view)
- Schedule request forms
- Trade request cards
- Dashboard widgets

---

## Success Criteria

After implementation, the app should:
1. ✅ Have excellent text contrast (WCAG AA minimum, AAA preferred)
2. ✅ Feel modern and vibrant (not clinical or dull)
3. ✅ Use indigo as clear primary action color
4. ✅ Maintain semantic color meanings (green=available, etc.)
5. ✅ Look cohesive across all pages
6. ✅ Be easy to read for extended use

---

## Next Steps

1. **Review this brainstorm** - ensure all decisions captured
2. **Create implementation plan** - detailed file changes, testing strategy
3. **Implement in phases** - CSS variables first, then component review
4. **Visual QA** - review all major pages/components
5. **User feedback** - validate improved visibility and pleasantness

---

## Notes

- This redesign is **light mode only** - dark mode remains unchanged unless user requests it
- Focus is on **color/contrast**, not layout or component changes
- If user wants to preserve any Rush colors as secondary accents, we can add them back selectively
