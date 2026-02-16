# Sprint 0 Backlog (Week 1)

## Goal

Stabilize authentication, authorization, and bootstrap flows so the app can safely move into feature delivery sprints.

## Stories

### S0-001: Fix frontend mutation wiring

- Scope: replace direct function-reference calls with `useMutation`.
- Acceptance criteria:
  - Seed buttons execute mutations successfully.
  - Mutation errors are surfaced to users.

### S0-002: Enforce admin-only seed operations after bootstrap

- Scope: require admin role for seed mutations when physician records already exist.
- Acceptance criteria:
  - Non-admin cannot reseed data.
  - Admin can run seed operations idempotently.

### S0-003: Implement physician profile linkage by authenticated email

- Scope: support linking Convex auth user to physician record via email.
- Acceptance criteria:
  - Existing seeded physician can sign in and access physician-gated functions.
  - Link mutation rejects conflicting links.

### S0-004: Guard fiscal-year read APIs

- Scope: require authenticated physician context for fiscal-year read queries.
- Acceptance criteria:
  - Unauthenticated/unlinked users cannot read protected fiscal-year data.

### S0-005: Add bootstrap setup path for empty database

- Scope: provide a first-run setup screen when no physicians exist.
- Acceptance criteria:
  - New deployment shows setup instructions and initial seed action.
  - Post-seed flow directs users to sign in as seeded admin.

### S0-006: Establish planning and repository governance docs

- Scope: add sprint/backlog/runbook/repo-structure documentation.
- Acceptance criteria:
  - `docs/` contains roadmap, backlog, and runbooks.
  - README points to docs and accurate folder layout.
