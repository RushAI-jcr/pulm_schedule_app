# Deployment Runbook

## Environments

- Development: local `convex dev`
- Staging/preview: per-branch preview deployment (PR-driven)
- Production: protected main-branch deployment

## Baseline pipeline

1. Run checks: typecheck, tests, build
2. Deploy backend + frontend together
3. Verify health checks and critical user journeys
4. Mark release and notify team

## GitHub workflows

- CI: `.github/workflows/ci.yml`
- Preview deploys: `.github/workflows/preview-deploy.yml`
- Production deploy: `.github/workflows/deploy.yml`

## Required secrets

- Preview environment:
  - `CONVEX_DEPLOY_KEY` (preview key)
- Production environment:
  - `CONVEX_DEPLOY_KEY` (production key)
  - `VITE_CONVEX_URL` (production frontend Convex URL)

See `docs/runbooks/environment-variables.md` for environment matrix.

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
