# Convex Backend Guide

This folder contains schema, auth config, server functions, and backend libraries for the physician scheduling app.

## Key files

- `schema.ts`: table definitions and indexes
- `functions/`: public Convex queries, mutations, and actions
- `lib/`: shared backend domain logic
- `auth.config.ts`: WorkOS JWT provider configuration for Convex auth
- `_generated/`: generated API/types (do not edit manually)

## Local backend workflow

1. Ensure required env vars are present in `.env.local`:
   - `NEXT_PUBLIC_CONVEX_URL`
   - `WORKOS_CLIENT_ID`
2. Start local Convex dev:
   ```bash
   npm run dev:backend
   ```
3. Typecheck backend:
   ```bash
   npm run typecheck
   ```

## Deploy backend

### Preview

Runs via `.github/workflows/preview-deploy.yml` on pull requests when required secrets are configured.

### Production

Runs via `.github/workflows/deploy.yml` on pushes to `main` (or manual dispatch), using environment-scoped production secrets.

### Manual deploy

```bash
npx convex deploy
```

Use `CONVEX_DEPLOY_KEY` for non-interactive deployments in CI.
