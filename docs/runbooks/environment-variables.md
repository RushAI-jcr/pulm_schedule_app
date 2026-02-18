# Environment Variables by Environment

## Local development

- `NEXT_PUBLIC_CONVEX_URL`: local/dev Convex URL
- `WORKOS_CLIENT_ID`: WorkOS AuthKit client ID (also required in Convex deployment env)
- `WORKOS_API_KEY`: WorkOS API key for AuthKit server actions/routes
- `WORKOS_COOKIE_PASSWORD`: >= 32-character encryption key for session cookie
- `NEXT_PUBLIC_WORKOS_REDIRECT_URI`: callback URL (for local: `http://localhost:3000/callback`)
- `CALENDARIFIC_API_KEY`: Calendarific API key for religious observances (optional)
- `SENTRY_DSN` (optional): local error capture

## Preview / staging

- `CONVEX_DEPLOY_KEY`: preview deploy key (preview environment only)
- `NEXT_PUBLIC_CONVEX_URL`: preview Convex deployment URL
- `WORKOS_CLIENT_ID`: preview WorkOS AuthKit client ID
- `WORKOS_API_KEY`: preview WorkOS API key
- `WORKOS_COOKIE_PASSWORD`: preview cookie encryption key
- `NEXT_PUBLIC_WORKOS_REDIRECT_URI`: preview callback URL
- `SENTRY_DSN`: staging DSN (if used)

## Production

- `CONVEX_DEPLOY_KEY`: production deploy key
- `NEXT_PUBLIC_CONVEX_URL`: production Convex URL
- `WORKOS_CLIENT_ID`: production WorkOS AuthKit client ID
- `WORKOS_API_KEY`: production WorkOS API key
- `WORKOS_COOKIE_PASSWORD`: production cookie encryption key
- `NEXT_PUBLIC_WORKOS_REDIRECT_URI`: production callback URL (`https://<domain>/callback`)
- `CALENDARIFIC_API_KEY`: Calendarific API key for religious observances (optional)
- `SENTRY_DSN`: production DSN

## Policy

- Never commit real secrets.
- Keep `.env.example` up to date.
- Rotate deploy keys on credential exposure or operator turnover.
- Use environment-scoped secrets in GitHub Actions.
- Keep frontend host env vars in sync with GitHub workflow env vars.
