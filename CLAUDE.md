# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pulmonary physician annual clinical scheduling app (Rush PCCM). Collects physician preferences, enforces staffing/cFTE constraints, and publishes a master 52-week calendar. Built with Next.js 15 + React 19 frontend and Convex reactive backend. Authentication via WorkOS AuthKit with Convex custom JWT validation.

## Commands

```bash
npm run dev              # Start both frontend (Next.js) and backend (Convex) dev servers
npm run dev:frontend     # Next.js only
npm run dev:backend      # Convex dev only
npm run build            # Next.js production build
npm run lint             # Full lint gate: typecheck both tsconfigs + next build
npm run lint:convex      # Validate Convex functions against remote schema (convex dev --once)
npm run test             # Run all Vitest tests (vitest run)
npm run test:authz       # Grep-based auth guard verification (scripts/verify-auth-guards.sh)
npx vitest run tests/rateLimit.test.ts  # Run a single test file
```

There are **two separate tsconfig files** that must both pass:
- `convex/tsconfig.json` — Convex backend (ESNext target, `convex/` scope)
- `tsconfig.json` — Next.js frontend (`src/` scope)

The `npm run lint` command checks both: `tsc -p convex -noEmit && tsc -p . -noEmit && next build`

## Architecture

### Backend: `convex/`

- **`convex/schema.ts`** — Single source of truth for all database tables and indexes. Key tables: `users`, `physicians`, `fiscalYears`, `weeks`, `rotations`, `scheduleRequests`, `weekPreferences`, `rotationPreferences`, `masterCalendars`, `assignments`, `tradeRequests`, `calendarEvents`, `auditLog`, `rateLimitEvents`.
- **`convex/functions/`** — Public Convex queries and mutations organized by domain (physicians, fiscalYears, scheduleRequests, tradeRequests, masterCalendar, rotationPreferences, calendarEvents, auditLog, etc.). These are the API surface.
- **`convex/lib/`** — Shared backend helpers (pure functions and db utilities). Key modules:
  - `auth.ts` — `requireAuthenticatedUser()`, `getCurrentPhysician()`, `requireAdmin()` — authorization guards used by all functions.
  - `roles.ts` — `AppRole` type, `resolveEffectiveRole()`, role precedence logic (`admin > physician > viewer`).
  - `rateLimit.ts`, `workflowPolicy.ts`, `masterCalendarAssignments.ts`, `masterCalendarPublish.ts`, `scheduleImport.ts` — domain-specific logic.
- **`convex/auth.ts`** — `loggedInUser` query: resolves WorkOS identity → app user → linked physician → effective role. Used by middleware and frontend.

### Frontend: `src/`

- **`src/app/`** — Next.js App Router pages. Public routes: `/`, `/sign-in`, `/sign-up`, `/callback`, `/reset-password`. Protected: `/dashboard`, `/trades`.
- **`src/features/`** — Feature-scoped components (e.g., `auth/`, `dashboard/`).
- **`src/shared/`** — Shared utilities, types, constants, services, UI components. Barrel-exported from `src/shared/index.ts`.
- **`src/config/`** — App configuration (theme settings).
- **`src/app/providers.tsx`** — Root client wrapper: `AuthKitProvider` + `ConvexProviderWithAuth` bridging WorkOS tokens to Convex auth.
- **`middleware.ts`** — Next.js middleware: WorkOS AuthKit session check + role-based route protection. Queries Convex `loggedInUser` to get effective role, then enforces `routeRoleRequirements` map.

Path alias: `@/*` maps to `./src/*`.

### Tests: `tests/`

Unit tests for `convex/lib/` pure functions using Vitest. Tests import directly from `convex/lib/` (no Convex runtime needed). No vitest config file — uses default Vitest discovery.

## Key Patterns

### Authorization

Every Convex mutation/query in `convex/functions/` must call one of:
- `requireAuthenticatedUser(ctx)` — any logged-in user
- `getCurrentPhysician(ctx)` — logged-in + linked physician
- `requireAdmin(ctx)` — admin role required

The `scripts/verify-auth-guards.sh` grep-checks that every function file has proper guards. Authorization is **always server-side in Convex functions**, never client-only.

### Role Resolution

Roles come from three sources merged by `resolveEffectiveRole()`: app `users.role`, `physicians.role`, and WorkOS identity claims. Highest role wins. Default for new authenticated users is `physician`.

### Physician Linkage

WorkOS accounts link to physician records by `userId` (WorkOS subject) or email match. Linkage happens via `linkCurrentUserToPhysicianByEmail` or `syncWorkosSessionUser` mutations. Admin users may or may not have a linked physician profile.

### Convex Conventions

- Always include `args` and `returns` validators on all Convex functions.
- Use `v.null()` for functions that don't return a value.
- Use `internalQuery`/`internalMutation`/`internalAction` for private functions; `query`/`mutation`/`action` for public API.
- Use `.withIndex()` instead of `.filter()` for queries.
- Use `ctx.db.patch()` for partial updates, `ctx.db.replace()` for full replacement.
- Include all index fields in the index name (e.g., `by_fiscalYear_weekNumber`).

## Environment Variables

Required for local dev (see `.env.example`):
- `NEXT_PUBLIC_CONVEX_URL` — Convex deployment URL
- `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD` — WorkOS AuthKit
- `NEXT_PUBLIC_WORKOS_REDIRECT_URI` — `http://localhost:3000/callback` for local

Optional: `CALENDARIFIC_API_KEY` (religious observances), `SENTRY_DSN`.

## Branch Conventions

- Agent branches: `codex/<scope>-<description>`
- Main branch: `main`
