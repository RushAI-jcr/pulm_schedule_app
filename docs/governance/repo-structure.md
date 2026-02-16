# Repository Structure and Conventions

## Top-level layout

- `src/`: frontend application code
- `convex/`: backend functions, schema, auth, and integrations
- `docs/`: planning and operations documentation
- `.github/`: templates and CI/CD workflow definitions

## Local organization standards

- Keep domain logic close to ownership boundary:
  - UI state/rendering in `src/`
  - data and authorization logic in `convex/`
- Add new docs under `docs/` rather than ad-hoc root markdown files.
- Keep runbook content in `docs/runbooks/`.

## Repository standards

- Branch naming: `codex/<scope>-<description>` for agent-created branches.
- PR requirements:
  - linked story ID
  - test evidence
  - risk and rollback notes for infra/data changes
- File naming:
  - use lowercase kebab-case for docs (`sprint-0.md`)
  - keep TypeScript files in existing naming style by area
