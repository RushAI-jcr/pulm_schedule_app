# Security Exceptions Register

## Current exceptions

### SEC-001: npm audit unresolved high vulnerability

- Status: open
- Date identified: 2026-02-16
- Context: `npm install` reports one high-severity dependency vulnerability.
- Constraint: network restrictions prevented running `npm audit` details lookup in this environment.
- Mitigation in place:
  - lockfile committed
  - CI deterministic install with `npm ci`
  - dependency updates tracked in Sprint 4/5 backlog
- Required follow-up:
  - Run `npm audit --json` in CI/network-enabled environment.
  - Either patch/upgrade vulnerable dependency or document compensating controls.
  - Close exception with evidence.
