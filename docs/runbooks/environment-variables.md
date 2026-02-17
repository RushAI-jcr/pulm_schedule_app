# Environment Variables by Environment

## Local development

- `NEXT_PUBLIC_CONVEX_URL`: local/dev Convex URL
- `CONVEX_SITE_URL`: Convex site URL for auth routing
- `AUTH_WORKOS_ID`: WorkOS client ID for Convex Auth
- `AUTH_WORKOS_SECRET`: WorkOS client secret for Convex Auth
- `AUTH_WORKOS_ISSUER`: WorkOS issuer URL (default `https://api.workos.com/`)
- `AUTH_WORKOS_CONNECTION` (optional): fixed WorkOS connection ID
- `NEXT_PUBLIC_WORKOS_CONNECTION` (optional): same connection on client sign-in form
- `SENTRY_DSN` (optional): local error capture

## Preview / staging

- `CONVEX_DEPLOY_KEY`: preview deploy key (preview environment only)
- `NEXT_PUBLIC_CONVEX_URL`: set by deployment pipeline for preview backend
- `SENTRY_DSN`: staging DSN (if used)

## Production

- `CONVEX_DEPLOY_KEY`: production deploy key
- `NEXT_PUBLIC_CONVEX_URL`: production Convex URL
- `CONVEX_SITE_URL`: production site URL
- `AUTH_WORKOS_ID`: production WorkOS client ID
- `AUTH_WORKOS_SECRET`: production WorkOS client secret
- `SENTRY_DSN`: production DSN

## Policy

- Never commit real secrets.
- Keep `.env.example` up to date.
- Rotate deploy keys on credential exposure or operator turnover.
- Use environment-scoped secrets in GitHub Actions.
