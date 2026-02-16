# Disaster Recovery Runbook

## Backup strategy

- Use Convex backup/export capabilities on production deployments.
- Store backup metadata and retention policy in team ops records.

## Export

- Command: `npx convex export --path <directory>`
- Frequency: at minimum before major schema or release changes.

## Restore

- Command: `npx convex import <backup.zip>`
- Use `--replace` only with explicit incident lead approval.

## DR drill cadence

- Perform quarterly restore drill to non-production environment.
- Validate restored data integrity for physicians, fiscal years, and assignments.
- Record drill date, duration, issues found, and remediation actions.
