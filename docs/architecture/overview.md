# Architecture Overview

## Product intent

Pulmonary physician annual scheduling system that collects preferences, enforces staffing and cFTE constraints, and publishes a master clinical calendar.

## Current stack

- Frontend: Next.js 15 + React 19 + Tailwind (`src/`)
- Backend: Convex functions/schema/auth (`convex/`)
- Auth: Convex Auth + WorkOS SSO

## Core domain entities

- Physicians and roles (`viewer`, `physician`, `admin`)
- Role precedence uses `admin` > `physician` > `viewer`; authenticated users default to `physician` unless explicitly downgraded.
- App users (WorkOS-authenticated identities; admin may or may not be linked to a physician profile)
- Fiscal years and weeks
- Rotations, clinic types, physician clinic assignments
- Schedule requests (week and rotation preferences)
- Master calendars and assignments
- Trade requests
- Audit logs

## Production architecture target

- Separate Convex environments for dev/staging/prod
- Preview deployments per PR
- CI gates: typecheck, tests, build, security checks
- Observability: application errors and release health
- Recovery: documented backup/export/import workflow
