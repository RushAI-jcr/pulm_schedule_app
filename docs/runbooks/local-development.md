# Local Development Runbook

## Prerequisites

- Node.js 20.x (`.nvmrc`)
- npm 10+
- Convex account/project access
- WorkOS AuthKit app credentials

## Setup

1. Install dependencies: `npm install`
2. Copy env template: `cp .env.example .env.local`
3. Fill required values in `.env.local` (see `docs/runbooks/environment-variables.md`)
4. Start local stack: `npm run dev`

## Commands

- Frontend + backend: `npm run dev`
- Frontend only: `npm run dev:frontend`
- Backend only: `npm run dev:backend`
- Typecheck only: `npm run typecheck`
- Full local validation gate: `npm run check`
- Authorization guard check: `npm run test:authz`
- Convex remote validation: `npm run lint:convex`

## Troubleshooting

- Auth failures: verify Convex auth env vars and deployment URL.
- Auth redirect mismatch on non-default ports: callback routes derive `redirectUri` from the active request origin (`/callback` on current host/port), so ensure that origin is allowed in WorkOS.
- Emergency auto-link disable: set `ENABLE_PHYSICIAN_NAME_AUTOLINK=false` and restart services.
- Schema mismatch: run a fresh `convex dev` session and ensure codegen is updated.
- Stale local state: restart both frontend and Convex dev processes.
