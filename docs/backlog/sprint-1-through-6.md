# Story Index: Sprints 1-6

This is a concise story inventory for planning. Detailed acceptance criteria should be expanded in each sprint planning session.

## Delivered baseline (as of 2026-02-16)

- Core annual request workflow is implemented:
  - save request notes
  - set week preference
  - submit request
  - admin request review queue
- Core trade workflow is implemented:
  - propose trade
  - peer accept/decline
  - requester cancel
  - admin approve/deny
- Next focus is hardening with automated lifecycle/authorization tests and release readiness.

## Sprint 1

- `S1-001` Authorization matrix by role and resource
- `S1-002` Object-level auth helpers in Convex functions
- `S1-003` Cross-user access regression tests
- `S1-004` Query/index audit and remediation
- `S1-005` Error handling consistency for auth failures
- `S1-006` Data normalization policy (email, status enums)
- `S1-007` Security review sign-off

## Sprint 2

- `S2-001` Create schedule request draft
- `S2-002` Week preference editor
- `S2-003` Rotation preference editor
- `S2-004` Submission workflow and locking
- `S2-005` Revision workflow
- `S2-006` Request deadline enforcement
- `S2-007` Physician request history page
- `S2-008` Admin queue and status views

## Sprint 3

- `S3-001` Rotation catalog CRUD
- `S3-002` Clinic type catalog CRUD
- `S3-003` Physician clinic assignment management
- `S3-004` Physician cFTE targets management
- `S3-005` Calendar assignment grid MVP
- `S3-006` Assignment conflict validation
- `S3-007` cFTE compliance calculations and flags
- `S3-008` Publish flow for master calendar
- `S3-009` Read-only published schedule view
- `S3-010` Audit logging for admin scheduling actions

## Sprint 4

- `S4-001` CI workflow (typecheck + tests + build)
- `S4-002` Branch protection and required checks
- `S4-003` Preview deployment setup
- `S4-004` Production deployment workflow
- `S4-005` Environment variable management policy
- `S4-006` Dependency update automation
- `S4-007` Release checklist and versioning policy

## Sprint 5

- `S5-001` Structured server logging strategy
- `S5-002` Authentication and authorization audit events
- `S5-003` Error tracking integration
- `S5-004` Release health dashboards
- `S5-005` Security headers and CSP enforcement
- `S5-006` Rate limiting for sensitive mutations
- `S5-007` Backup/export schedule and retention policy
- `S5-008` Backup restore drill and runbook validation

## Sprint 6

- `S6-001` UAT scripts for physicians/admins
- `S6-002` Performance and capacity validation
- `S6-003` Go-live readiness review
- `S6-004` Production cutover plan
- `S6-005` Rollback rehearsal
- `S6-006` Hypercare support workflow
