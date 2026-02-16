# Architecture Overview

## Product intent

Pulmonary physician annual scheduling system that collects preferences, enforces staffing and cFTE constraints, and publishes a master clinical calendar.

## Current stack

- Frontend: React 19 + Vite + Tailwind (`src/`)
- Backend: Convex functions/schema/auth (`convex/`)
- Auth: Convex Auth (email/password)

## Core domain entities

- Physicians and roles (`physician`, `admin`)
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
