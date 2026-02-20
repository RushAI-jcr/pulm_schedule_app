# Deployment Runbook

## Environments

- Development: local `convex dev`
- Preview: per-PR Convex preview deployment
- Production: protected `main` Convex deployment + frontend host deployment

## Pipeline overview

1. `CI` validates typecheck + authz checks + tests + build.
2. `Preview Deploy (Convex)` runs on PRs and deploys Convex preview backend when secrets are configured.
3. `Deploy (Convex Production)` runs on `main` and deploys Convex production backend.
4. Frontend deployment is handled by Vercel Git integration (or equivalent host pipeline).

## GitHub workflows

- CI: `.github/workflows/ci.yml`
- Preview Convex deploy: `.github/workflows/preview-deploy.yml`
- Production Convex deploy: `.github/workflows/deploy.yml`

## Required secrets

### Required for preview and production workflow runs

- `CONVEX_DEPLOY_KEY` (environment-specific key)
- `NEXT_PUBLIC_CONVEX_URL`
- `WORKOS_CLIENT_ID`
- `WORKOS_API_KEY`
- `WORKOS_COOKIE_PASSWORD`
- `NEXT_PUBLIC_WORKOS_REDIRECT_URI`

### Optional

- `CALENDARIFIC_API_KEY` (religious observance imports)
- `SENTRY_DSN` (error monitoring)

See `docs/runbooks/environment-variables.md` for environment matrix.

## Frontend host requirements

- Configure the same runtime variables on your frontend host (Vercel recommended).
- Custom domain is optional on Vercel; the default `*.vercel.app` production URL is supported.
- Ensure WorkOS redirect allowlist includes your active callback URL (for example, `https://<project>.vercel.app/callback`).
- `NEXT_PUBLIC_WORKOS_REDIRECT_URI` can be used as an explicit override, but middleware/auth routes derive callback URLs from the active request origin.
- Set `NEXT_PUBLIC_CONVEX_URL` to the environment-specific Convex deployment URL.

## Required checks before production

- No failing CI checks
- No critical/high unresolved security alerts
- Database/schema changes reviewed
- Rollback strategy documented for the release

## Post-deploy validation

- Admin sign-in and physician sign-in
- Physician list and fiscal year queries
- Schedule request entry path
- Admin setup actions (if relevant)
