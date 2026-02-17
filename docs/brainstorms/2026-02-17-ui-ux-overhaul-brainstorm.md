# UI/UX Overhaul Brainstorm

**Date:** 2026-02-17
**Status:** Draft
**Scope:** Complete frontend redesign of the Rush PCCM Calendar Assistant

---

## What We're Building

A physician-first UI/UX overhaul that transforms the current monolithic dashboard into a beautiful, role-aware scheduling application. The app serves two distinct personas with different interaction patterns:

- **Physicians** (primary): View their annual calendar, submit schedule preferences once per year via a guided wizard, request trades, and export/subscribe to calendar feeds. They interact with the app infrequently but need it to be intuitive and visually clear.
- **Admins**: Build and publish the master calendar, manage rotations/clinics/cFTE, review requests, and analyze reports across fiscal years. They need power tools with deep data visibility.

---

## Why This Approach

### Physician-First Design
Physicians are the majority of users and interact infrequently. If the app feels confusing or ugly, adoption drops. A beautiful hybrid calendar as the centerpiece — year-at-a-glance that zooms into month/week detail — makes the app feel valuable even when physicians are just checking their schedule.

### Component Library (shadcn/ui)
The current app has ~4,100 lines in a single monolithic file with no shared components. Duplicate StatusBadge components, inconsistent button styles, and hand-written Tailwind everywhere. shadcn/ui gives us:
- Consistent, accessible components (buttons, cards, tables, modals, selects, dialogs)
- Rush brand theming via CSS variables
- Copy-paste ownership (no dependency lock-in)
- Dark mode support built-in

### URL-Based Admin Routing
Moving admin sections from client-side tab state to dedicated `/admin/*` routes enables bookmarkable URLs, better code-splitting, and breaking up the monolith.

---

## Key Decisions

### 1. Navigation Structure

**Physicians:** Collapsible left sidebar with icons
- Calendar (default landing)
- Submit Preferences (when FY request window is open)
- Trades
- Profile / Settings

**Admins:** Same sidebar structure with additional admin section
- All physician links above, plus:
- Admin divider
- Master Calendar (edit mode)
- Rotations & Clinics
- Schedule Requests
- Reports & Analytics
- Audit Log

### 2. Calendar Experience (Physician View)

**Hybrid calendar** — two modes:

- **Year Overview (default):** 52-week compact grid showing the full fiscal year at a glance. Each week is a color-coded cell by rotation type. Physician's own assignments highlighted. Click any week/month to zoom in.
- **Month Detail:** Traditional monthly calendar grid. Each day shows rotation assignment, holidays, conferences. Click a day for full details in a sheet/drawer.

Toggle between "My Calendar" and "Department Calendar" (read-only view of all physicians).

### 3. Schedule Request Wizard (Annual, Physician)

Guided step-by-step flow:
1. **Week Availability** — Mark each week as Available (green) / Prefer Not (yellow) / Unavailable (red). Visual 52-week grid.
2. **Rotation Preferences** — Rank or rate rotation preferences.
3. **Review & Submit** — Summary of all selections with ability to go back and edit.

Progress bar at top. One concern at a time. Mobile-friendly.

### 4. Admin Routing & Layout

Dedicated URL routes under `/admin/`:
| Route | Page |
|-------|------|
| `/admin` | Admin dashboard overview (summary metrics) |
| `/admin/calendar` | Master calendar editor (drag-and-drop, auto-assign) |
| `/admin/rotations` | Rotation & clinic type CRUD |
| `/admin/cfte` | cFTE target management |
| `/admin/requests` | Schedule request queue + trade approval |
| `/admin/reports` | Reports & analytics dashboard |
| `/admin/audit` | Audit log viewer |
| `/admin/settings` | FY setup, holiday imports, fiscal year transitions |

### 5. Admin Reports Suite

Five report categories:
1. **Holiday Coverage** — Who worked Christmas, Thanksgiving, New Year's, etc. Multi-year fairness tracking with visual equity indicators.
2. **Rotation Distribution** — Weeks per rotation per physician. Bar charts, heatmaps, equity analysis.
3. **cFTE Compliance** — Actual vs. target cFTE per physician. Variance highlighting.
4. **Trade Activity** — Trade volume, approval rates, most active traders. Pattern identification.
5. **Year-over-Year Trends** — Multi-FY comparison of rotation assignments, holiday burden, workload distribution.

### 6. ICS Calendar Integration

**Live subscription URL** — Each physician gets a unique iCal subscription URL. When the schedule is published or trades are approved, the feed auto-updates. Physicians add it once to Apple Calendar / Google Calendar and it stays current.

Also keep static .ics download as an alternative.

### 7. Calendar Scope

- **"My Calendar"** — Default view showing only the physician's own assignments.
- **"Department Calendar"** — Toggle to see all physicians' assignments (read-only). Useful for knowing who's covering what rotation.
- Both views support year overview and month detail zoom.

### 8. Mobile Responsiveness

Fully responsive design:
- **Desktop:** Collapsible sidebar navigation, full calendar grids, side-by-side panels for reports.
- **Tablet:** Sidebar collapses to icon-only rail. Calendar still shows full grids.
- **Mobile:** Sidebar becomes bottom tab bar (Calendar, Trades, Preferences, Profile). Calendar year overview becomes a scrollable list or condensed view. Month detail is touch-friendly.

### 9. Notification System

Dual notification approach:
- **Email notifications** for high-priority events: schedule published, incoming trade request, request window opens/closes, trade approved/rejected.
- **In-app notification center** with bell icon + badge count. Shows all recent activity. Physicians can mark as read. Persisted in Convex.

### 10. Calendar Boundaries

Always fiscal year (July-June). The FY is the natural scheduling unit. Year overview shows Week 1 (first week of July) through Week 52. No calendar-year toggle.

### 11. Technology Choices

| Area | Choice | Rationale |
|------|--------|-----------|
| UI Components | shadcn/ui | Radix-based, accessible, customizable, owned code |
| Calendar Rendering | Custom components with shadcn primitives | No off-the-shelf calendar library matches the hybrid year/month need |
| Charts (Reports) | Recharts or Tremor | React-native charting, shadcn-compatible |
| Icons | Lucide React | Already bundled with shadcn/ui |
| Animations | Tailwind + Framer Motion (light) | Page transitions, sidebar collapse, calendar zoom |

---

## Resolved Questions

1. **Mobile responsiveness** — Fully responsive. Sidebar collapses to bottom tab bar on mobile. Calendar adapts to smaller screens. Physicians are often on-the-go between patients.
2. **Notification system** — Both email + in-app. Email for important events (schedule published, incoming trade requests, request window opens). In-app notification center with badge counts for less critical updates.
3. **Calendar boundaries** — Always FY boundaries (July-June). This matches how schedules are built and is the natural unit for the scheduling workflow.

## Open Questions

1. **Chart library preference** — Recharts (lightweight, popular) vs. Tremor (shadcn-style, higher-level) vs. another option for the admin reports?

---

## Out of Scope (for this brainstorm)

- Backend/Convex schema changes (separate effort if needed)
- Authentication flow changes (WorkOS stays)
- Auto-scheduling algorithm improvements
- Mobile native app
