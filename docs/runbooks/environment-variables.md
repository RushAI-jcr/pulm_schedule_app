# Environment Variables by Environment

## Local development

- `VITE_CONVEX_URL`: local/dev Convex URL
- `CONVEX_SITE_URL`: Convex site URL for auth routing
- `SENTRY_DSN` (optional): local error capture

## Preview / staging

- `CONVEX_DEPLOY_KEY`: preview deploy key (preview environment only)
- `VITE_CONVEX_URL`: set by deployment pipeline for preview backend
- `SENTRY_DSN`: staging DSN (if used)

## Production

- `CONVEX_DEPLOY_KEY`: production deploy key
- `VITE_CONVEX_URL`: production Convex URL
- `CONVEX_SITE_URL`: production site URL
- `SENTRY_DSN`: production DSN

## Policy

- Never commit real secrets.
- Keep `.env.example` up to date.
- Rotate deploy keys on credential exposure or operator turnover.
- Use environment-scoped secrets in GitHub Actions.
