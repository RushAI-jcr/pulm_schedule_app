# Local Development Runbook

## Prerequisites

- Node.js LTS
- npm
- Convex account/project access

## Setup

1. Install dependencies: `npm install`
2. Configure env: ensure `.env.local` exists with required keys.
3. Start local stack: `npm run dev`

## Commands

- Frontend + backend: `npm run dev`
- Frontend only: `npm run dev:frontend`
- Backend only: `npm run dev:backend`
- Typecheck/build lint gate: `npm run lint`
- Authorization guard check: `npm run test:authz`
- Convex remote validation: `npm run lint:convex`

## Troubleshooting

- Auth failures: verify Convex auth env vars and deployment URL.
- Schema mismatch: run a fresh `convex dev` session and ensure codegen is updated.
- Stale local state: restart both frontend and Convex dev processes.
