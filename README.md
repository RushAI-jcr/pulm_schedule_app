# Pulm Schedule App

Physician clinical scheduling application built with React + Vite (frontend) and Convex (backend).

## Quick start

```bash
npm install
npm run dev
```

This starts both frontend and Convex development servers.

## Repository layout

- `src/`: React UI
- `convex/`: Convex schema, queries, mutations, auth, HTTP routes
- `docs/`: roadmap, sprint backlog, runbooks, and repo conventions
- `.github/`: issue/PR templates and automation scaffolding

See `docs/README.md` for full documentation map.

## Product scope

The app supports annual physician scheduling workflows:

- physician/admin role management
- fiscal year and week planning
- preference collection (weeks, rotations)
- cFTE planning and compliance
- master calendar build/publish
- trade/swap workflows
- audit logging

## Authentication

Authentication uses Convex Auth. Production flow is email/password and physician profile linkage by email.

## Docs

- Sprint plan: `docs/sprints/roadmap.md`
- Ticketized backlog: `docs/backlog/epics.md`
- Sprint 0 execution details: `docs/backlog/sprint-0.md`
- Deployment runbook: `docs/runbooks/deployment.md`
- Local setup runbook: `docs/runbooks/local-development.md`
