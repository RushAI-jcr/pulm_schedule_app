---
title: Modern Indigo Light Mode Color Palette
type: feat
date: 2026-02-18
brainstorm: docs/brainstorms/2026-02-18-light-mode-color-palette-redesign-brainstorm.md
---

# Modern Indigo Light Mode Color Palette

## Overview

Redesign the light mode color palette from sage-green Rush branding to a Notion-inspired modern indigo theme. Addresses poor contrast, dull/clinical feel, and harsh dark green primary. Dark mode remains unchanged.

**Brainstorm:** [docs/brainstorms/2026-02-18-light-mode-color-palette-redesign-brainstorm.md](../brainstorms/2026-02-18-light-mode-color-palette-redesign-brainstorm.md)

## Problem Statement

Current light mode palette has three critical issues:
1. **Poor contrast** - sage green backgrounds (#F2F6F3) make text hard to read
2. **Dull/clinical feel** - institutional sage tones lack vibrancy
3. **Harsh primary** - dark legacy green (#006332) feels heavy and severe

Users want modern, vibrant, Notion-like aesthetics with excellent readability.

## Proposed Solution

Replace sage-green palette with **Modern Indigo** theme:

### New Color Palette

**Primary Colors:**
- Primary: `#6366F1` (indigo-500) - vibrant, friendly, professional
- Primary Hover: `#4F46E5` (indigo-600)
- Background: `#FAFAFA` (gray-50) - warm, inviting
- Surface: `#FFFFFF` (white cards)
- Text: `#1F2937` (gray-900) - WCAG AAA contrast

**Semantic Scheduling Colors:**
- Available: `#10B981` (emerald-500)
- Prefer Not: `#F59E0B` (amber-500)
- Unavailable: `#EF4444` (red-500)
- Success: `#10B981`
- Warning: `#F59E0B`

**Design Decisions (from brainstorm):**
- Remove background gradients (clean, flat Notion aesthetic)
- Simple color set (indigo + semantic, no extra accents)
- Notion-style pronounced shadows with light borders

## Technical Approach

### Color System Architecture

The project uses a **three-layer color system**:

1. **shadcn/ui CSS Variables** (`src/index.css`) - semantic tokens
2. **Tailwind Extended Colors** (`tailwind.config.js`) - utility classes
3. **Legacy Rush Brand Colors** - backward compatibility

**Most components use semantic tokens** and will inherit changes automatically. Some components have hardcoded utilities requiring review.

### Implementation Phases

#### Phase 1: Update Core Color Variables

**File:** `src/index.css`

Update `:root` CSS variables for light mode (lines 6-71):

```css
:root {
  /* New Modern Indigo Palette */
  --background: 0 0% 98%;              /* #FAFAFA warm gray */
  --foreground: 217 33% 17%;           /* #1F2937 near-black */

  --card: 0 0% 100%;                   /* White */
  --card-foreground: 217 33% 17%;

  --popover: 0 0% 100%;
  --popover-foreground: 217 33% 17%;

  --primary: 239 84% 67%;              /* #6366F1 indigo */
  --primary-foreground: 0 0% 100%;     /* White on indigo */

  --secondary: 220 14% 96%;            /* #F3F4F6 gray-100 */
  --secondary-foreground: 239 84% 67%;

  --muted: 220 14% 96%;                /* #F3F4F6 */
  --muted-foreground: 215 16% 47%;     /* #6B7280 gray-500 */

  --accent: 220 14% 96%;               /* #F3F4F6 */
  --accent-foreground: 239 84% 67%;

  --destructive: 0 84% 60%;            /* Keep existing red */
  --destructive-foreground: 0 0% 100%;

  --border: 220 13% 91%;               /* #E5E7EB gray-200 */
  --input: 220 13% 91%;
  --ring: 239 84% 67%;                 /* Indigo focus rings */
  --radius: 0.5rem;

  /* Chart colors */
  --chart-1: 239 84% 67%;              /* Indigo */
  --chart-2: 45 93% 47%;               /* Amber */
  --chart-3: 158 64% 52%;              /* Emerald */
  --chart-4: 0 84% 60%;                /* Red */
  --chart-5: 199 89% 48%;              /* Blue */

  /* Sidebar */
  --sidebar-background: 0 0% 100%;
  --sidebar-foreground: 217 33% 17%;
  --sidebar-primary: 239 84% 67%;
  --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent: 220 14% 96%;
  --sidebar-accent-foreground: 239 84% 67%;
  --sidebar-border: 220 13% 91%;
  --sidebar-ring: 239 84% 67%;

  /* Rush app-level custom properties - update or remove */
  --app-bg: #fafafa;
  --app-surface: #ffffff;
  --app-surface-muted: #f3f4f6;
  --app-border: #e5e7eb;
  --app-text: #1f2937;
  --app-text-muted: #6b7280;

  /* Keep Rush colors for reference, but update primary usage */
  --rush-legacy-green: #006332;        /* Historical reference */
  --rush-vitality-green: #2dda8e;
  --rush-gold: #ffc600;
  --rush-dark-grey: #333333;
  --rush-indigo: #6366f1;              /* NEW - align with theme */
  --rush-cerulean-blue: #54add3;
  --rush-deep-blue: #00668e;
}
```

**Remove background gradients** (lines 154-160):

```css
/* OLD - Remove entirely */
body {
  background:
    radial-gradient(circle at top right, rgb(84 173 211 / 0.18), transparent 42%),
    radial-gradient(circle at bottom left, rgb(223 249 235 / 0.3), transparent 40%),
    hsl(var(--background));
}

/* NEW - Clean flat background */
body {
  background: hsl(var(--background));
}
```

**Update auth component classes** (lines 303-310):

```css
.auth-input-field {
  @apply w-full rounded-container border border-input bg-white px-4 py-3
         outline-none transition-shadow shadow-sm hover:shadow
         focus:border-primary focus:ring-1 focus:ring-primary
         dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100;
}

.auth-button {
  @apply w-full px-4 py-3 rounded bg-primary text-primary-foreground
         font-semibold hover:opacity-90 transition-opacity shadow-sm hover:shadow
         disabled:opacity-50 disabled:cursor-not-allowed;
}
```

#### Phase 2: Update Tailwind Configuration

**File:** `tailwind.config.js`

Update Rush brand colors (lines 18-30):

```javascript
rush: {
  'legacy-green': '#006332',      // Historical reference
  'vitality-green': '#2DDA8E',
  'gold': '#FFC600',
  'dark-grey': '#333333',
  'indigo': '#6366F1',             // NEW - primary theme color
  'cerulean-blue': '#54ADD3',
  'deep-blue': '#00668E',
  // Remove unused sage colors
},
```

Update semantic scheduling colors (lines 84-90):

```javascript
// Scheduling-specific semantic colors
warning: '#F59E0B',         // Amber
success: '#10B981',         // Emerald
available: '#10B981',       // Emerald (matches success)
'prefer-not': '#F59E0B',    // Amber (matches warning)
unavailable: '#EF4444',     // Red
```

#### Phase 3: Implement Notion-Style Shadows

Add custom shadow utilities to Tailwind config:

```javascript
extend: {
  boxShadow: {
    'card': '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
    'card-hover': '0 4px 6px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)',
    'elevated': '0 10px 20px rgba(0,0,0,0.1), 0 3px 6px rgba(0,0,0,0.05)',
  },
  // ... existing extend config
}
```

Update component shadow classes:
- Cards: Replace `shadow-sm` with `shadow-card` hover:`shadow-card-hover`
- Dialogs/modals: Use `shadow-elevated`

#### Phase 4: Review Component Color Usage

**Critical Institutional Learning:** Never use dynamic Tailwind class interpolation - JIT compiler requires static strings.

**Components using semantic tokens (auto-inherit):**
- ✅ Button (`src/shared/components/ui/button.tsx`)
- ✅ Card (`src/components/ui/card.tsx`)
- ✅ Badge (`src/components/ui/badge.tsx`)
- ✅ Input (`src/components/ui/input.tsx`)
- ✅ Sidebar (`src/components/layout/app-sidebar.tsx`)

**Components requiring review:**

1. **Auth Components:**
   - `src/features/auth/components/SignInForm.tsx` (lines 10-16)
   - `src/features/auth/components/SignOutButton.tsx` (line 16)
   - `src/app/page.tsx` (lines 13-41)
   - Action: Verify semantic token usage, update hardcoded grays if needed

2. **Dashboard:**
   - `src/features/dashboard/components/App.tsx` (167 instances of `bg-white`, `bg-gray-*`)
   - Action: Test with new background, decide if neutral grays need adjustment

3. **Status/Availability Components:**
   - `src/components/shared/status-badge.tsx`
   - `src/components/shared/availability-indicator.tsx`
   - Action: Verify semantic colors (emerald/amber/red) still look good with indigo theme

4. **Calendar:**
   - `src/components/calendar/calendar-tokens.ts` (rotation accents)
   - Action: Verify indigo-400 accent aligns with new primary, test contrast

### What NOT to Change

- ✅ Dark mode palette (`.dark` classes in index.css lines 73-124)
- ✅ Component structure/layout
- ✅ Typography (Calibre font stack)
- ✅ shadcn/ui semantic token architecture

## Acceptance Criteria

### Functional Requirements

- [x] Light mode uses Modern Indigo palette (#6366F1 primary, #FAFAFA background)
- [x] All CSS variables updated in `src/index.css`
- [x] Tailwind config updated with new semantic colors
- [x] Background gradients removed (clean flat aesthetic)
- [x] Auth components use semantic tokens (not hardcoded Rush green)
- [ ] Dark mode unchanged and functional

### Visual Requirements

- [ ] Excellent text contrast (WCAG AA minimum, AAA preferred)
- [ ] Indigo primary clearly visible on all interactive elements
- [ ] Notion-style pronounced shadows on cards/elevated elements
- [ ] Light borders (#E5E7EB) on cards and inputs
- [ ] Semantic colors (emerald/amber/red) work harmoniously with indigo

### Quality Gates

- [ ] Visual QA on all major pages:
  - [ ] Landing page (`/`)
  - [ ] Sign in/sign up (`/sign-in`, `/sign-up`)
  - [ ] Dashboard (`/dashboard`)
  - [ ] Calendar views
  - [ ] Schedule requests
  - [ ] Trade requests
- [ ] No console warnings about missing Tailwind classes
- [ ] TypeScript build passes (`npm run lint`)
- [ ] User confirms improved visibility and pleasantness

## Testing Strategy

### Manual Visual Testing

**Test in light mode only:**

1. **Color Accuracy:**
   - Verify primary buttons/links use #6366F1 indigo
   - Confirm background is #FAFAFA warm gray
   - Check text is #1F2937 near-black

2. **Contrast Testing:**
   - Use browser DevTools or Contrast Checker
   - Verify all text meets WCAG AA minimum (AAA preferred)
   - Test interactive elements (buttons, links, inputs)

3. **Component Inheritance:**
   - Check shadcn components auto-inherited new palette
   - Verify auth components updated correctly
   - Review dashboard for any color clashes

4. **Shadow Depth:**
   - Confirm cards have pronounced shadows
   - Test hover states deepen shadows
   - Verify visual hierarchy clear

5. **Dark Mode Preservation:**
   - Toggle to dark mode
   - Confirm no visual regressions
   - Ensure dark mode unchanged

### Browser Testing

- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)

### Accessibility

- [ ] Run axe DevTools or Lighthouse accessibility audit
- [ ] Verify WCAG 2.1 Level AA compliance minimum
- [ ] Test with browser zoom at 200%

## Success Metrics

**Immediate:**
- User reports improved visibility and readability
- Text contrast meets WCAG AAA where possible
- App feels modern and vibrant (not clinical)

**Long-term:**
- Easier to maintain (semantic tokens vs hardcoded colors)
- Foundation for future theming/customization
- Reduced user complaints about color/contrast

## Dependencies & Risks

### Dependencies
- None - pure CSS/config change

### Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Hardcoded colors missed | Medium | Low | Comprehensive grep for hex colors and `bg-rush-*` classes |
| Dark mode regression | Low | Medium | Toggle testing during QA |
| Component color clashes | Low | Low | Test all major component types |
| User dislikes new palette | Low | High | Revert is trivial (git checkout), gather feedback quickly |

## Implementation Checklist

### Phase 1: Core Variables
- [x] Update `src/index.css` `:root` variables (lines 6-71)
- [x] Remove background gradients (lines 154-160)
- [x] Update auth component classes (lines 303-310)
- [x] Update Rush custom properties or remove unused

### Phase 2: Tailwind Config
- [x] Update `rush` brand colors in `tailwind.config.js`
- [x] Update semantic scheduling colors
- [x] Add custom Notion-style shadow utilities

### Phase 3: Shadow Implementation
- [ ] Replace `shadow-sm` with `shadow-card` on cards
- [ ] Add hover states with `shadow-card-hover`
- [ ] Use `shadow-elevated` on modals/dialogs

### Phase 4: Component Review
- [ ] Test auth components (SignInForm, landing page)
- [ ] Review Dashboard.tsx hardcoded grays
- [ ] Verify status badges and availability indicators
- [ ] Check calendar rotation accents

### Phase 5: QA & Validation
- [x] Visual QA all major pages (landing page captured)
- [ ] Contrast testing (WCAG compliance) - User to test manually
- [ ] Browser testing (Chrome, Firefox, Safari) - User to test manually
- [x] Dark mode preservation check (unchanged in CSS)
- [ ] User acceptance - Ready for manual testing

## Files to Modify

### Primary Files
1. `src/index.css` - CSS variables, gradients, auth classes
2. `tailwind.config.js` - Rush colors, semantic colors, shadows

### Review Required
3. `src/features/auth/components/SignInForm.tsx`
4. `src/features/auth/components/SignOutButton.tsx`
5. `src/app/page.tsx`
6. `src/features/dashboard/components/App.tsx`
7. `src/components/shared/status-badge.tsx`
8. `src/components/shared/availability-indicator.tsx`
9. `src/components/calendar/calendar-tokens.ts`

## References

### Internal
- **Brainstorm:** [docs/brainstorms/2026-02-18-light-mode-color-palette-redesign-brainstorm.md](../brainstorms/2026-02-18-light-mode-color-palette-redesign-brainstorm.md)
- **Color system:** [src/index.css](../../src/index.css) lines 6-71
- **Tailwind config:** [tailwind.config.js](../../tailwind.config.js) lines 16-90
- **Theme config:** [src/config/theme.ts](../../src/config/theme.ts)

### Institutional Learnings
- **Tailwind JIT patterns:** Never use dynamic class interpolation (from calendar visual overhaul)
- **Dark mode handling:** Use explicit `dark:` variants, test opacity and alternative shades

### Design Inspiration
- Notion color palette (modern, vibrant, excellent contrast)
- shadcn/ui default themes (indigo/slate combinations)

## Notes

- **Light mode only** - Dark mode deliberately unchanged per user request
- **Reversible** - Pure CSS change, easy to revert if needed
- **Foundation** - Sets stage for future customization/theming
- **Rush colors preserved** - Kept in Tailwind config for historical reference, but not primary usage
