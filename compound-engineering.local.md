---
review_agents:
  - compound-engineering:review:kieran-typescript-reviewer
  - compound-engineering:review:security-sentinel
  - compound-engineering:review:performance-oracle
  - compound-engineering:review:architecture-strategist
  - compound-engineering:review:code-simplicity-reviewer
  - compound-engineering:review:julik-frontend-races-reviewer
---

# Review Context

This is a Next.js 15 + React 19 + Convex application for physician clinical scheduling.

## Key Conventions
- All Convex functions require `requireAuthenticatedUser`, `getCurrentPhysician`, or `requireAdmin` guards
- Frontend is in `src/`, backend in `convex/`, tests in `tests/`
- Tailwind CSS for styling — all class strings must be static (no dynamic concatenation at runtime, Tailwind purges dynamic classes)
- Path alias: `@/*` maps to `./src/*`
- Two tsconfigs: `convex/tsconfig.json` and `tsconfig.json` — both must pass
- Component library: shadcn/ui primitives in `src/components/ui/` and `src/shared/components/ui/`

## This PR: Calendar Visual Overhaul
Pure frontend visual redesign — no Convex backend changes. Changed files:
- `src/components/calendar/calendar-legend.tsx` — new color palette
- `src/components/calendar/calendar-grid-utils.ts` — extracted shared utilities (new file)
- `src/components/calendar/year-month-stack.tsx` — new 12-month stacked year view (new file)
- `src/components/calendar/month-detail.tsx` — color system update
- `src/app/(authenticated)/calendar/page.tsx` — page integration
- `src/app/(authenticated)/admin/calendar/page.tsx` — admin grid restyle
- Deleted: `year-overview.tsx`, `calendar-cell.tsx`
