# Production Roadmap

Assumption: 2-week sprints, except Sprint 0 (1 week).

## Sprint 0 (Week 1): Foundation hardening

- Fix auth/profile linkage and admin enforcement
- Fix frontend mutation wiring and bootstrap setup path
- Establish docs/backlog/repo conventions

## Sprint 1 (Weeks 2-3): Authorization and data integrity

- Apply object-level authorization checks
- Index/query audit and performance-safe access patterns
- Add auth + permission tests

## Sprint 2 (Weeks 4-5): Scheduling request workflow MVP

- Build request draft/submit/revise flows
- Week/rotation preference forms and APIs
- Admin request review queue

## Sprint 3 (Weeks 6-7): Calendar builder and cFTE compliance

- Rotation/clinic config UI + APIs
- Assignment grid and validation logic
- cFTE compliance dashboard

## Sprint 4 (Weeks 8-9): CI/CD and release pipeline

- GitHub Actions checks + quality gates
- Preview deployments + production deployment
- Branch protections and release policy

## Sprint 5 (Weeks 10-11): Security, observability, recovery

- Audit/security logs
- Sentry/release telemetry integration
- Backup/export/import and DR rehearsal

## Sprint 6 (Weeks 12-13): UAT and go-live

- End-to-end UAT with admins/physicians
- Launch checklist and rollback drill
- Hypercare metrics and incident handling
