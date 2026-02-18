# Physician Clinical Scheduling App

Physician clinical scheduling application built with Next.js (frontend) and Convex (backend).

## Prerequisites

- Node.js `20.x` (`.nvmrc` is included)
- npm `10+`
- Convex project access
- WorkOS AuthKit app credentials

## Local setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy and populate environment variables:
   ```bash
   cp .env.example .env.local
   ```
3. Start frontend + backend:
   ```bash
   npm run dev
   ```

## Common commands

- `npm run dev`: start Next.js + Convex dev servers
- `npm run typecheck`: typecheck Convex + app code
- `npm run test`: run unit tests (Vitest)
- `npm run build`: production Next.js build
- `npm run check`: CI-equivalent validation (typecheck + authz + tests + build)

## GitHub CI/CD

### Workflows

- `.github/workflows/ci.yml`: validates every PR and push to `main`
- `.github/workflows/preview-deploy.yml`: deploys preview Convex backend on PRs
- `.github/workflows/deploy.yml`: deploys production Convex backend on `main`

### Required GitHub secrets

- `CONVEX_DEPLOY_KEY`
- `NEXT_PUBLIC_CONVEX_URL`
- `WORKOS_CLIENT_ID`
- `WORKOS_API_KEY`
- `WORKOS_COOKIE_PASSWORD`
- `NEXT_PUBLIC_WORKOS_REDIRECT_URI`

### Frontend hosting

These GitHub workflows deploy Convex backend infrastructure. Host the Next.js frontend using Vercel Git integration (recommended) or your preferred Node host, and mirror the same runtime environment variables there.

## Repository layout

- `src/`: React UI
- `convex/`: Convex schema, server functions, auth, HTTP router
- `docs/`: runbooks, architecture, and planning docs
- `.github/`: issue templates and CI/CD workflows

See `docs/README.md` for the full documentation map.
