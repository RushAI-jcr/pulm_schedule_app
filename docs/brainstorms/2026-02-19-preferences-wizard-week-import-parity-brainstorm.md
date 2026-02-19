# Brainstorm: Preferences Wizard Week-Import Parity

**Date:** 2026-02-19  
**Status:** Ready for planning  
**Feature:** Add existing CSV/XLSX week-preference import behavior to the `/preferences` wizard for both physicians and admins.

---

## What We're Building

Add the current week-preference import workflow (red/yellow/green/unset by week) into the newer `/preferences` wizard so users do not need the older dashboard panel for this task.

The workflow must preserve current behavior exactly:
- Parse `.xlsx` and `.csv` using the existing parser.
- Enforce filename doctor token + fiscal year token validation.
- Validate full week coverage against the active fiscal year.
- Import by replacing the target schedule request's week preferences.
- Respect existing auth and fiscal-year state constraints (`collecting` window only).

The `/preferences` flow must support:
- Physician self-import.
- Admin import for a selected physician.

---

## Why This Approach

### Approach A (Not chosen): Rebuild import logic directly in wizard-only code
Pros: Fastest initial wiring for one page.  
Cons: Duplicates parser/validation UX patterns and increases drift risk between flows.

### Approach B (Chosen): Reuse current import behavior and add parity UI in `/preferences`
Pros: Lowest behavioral risk, keeps parser + mutation contract stable, reduces regression scope.  
Cons: Requires careful role-aware UX in the wizard.

### Approach C (Not chosen): Keep old dashboard import as primary path
Pros: No migration work.  
Cons: Splits user workflows, keeps legacy UI as long-term dependency.

Recommendation: Approach B with phased cleanup of old panels after parity is confirmed.

---

## Key Decisions

- Keep backend import behavior unchanged (`importWeekPreferencesFromUpload` remains source of truth).
- Expose import in `/preferences` for both self-import and admin-on-behalf import.
- Keep strict validation rules and current file conventions; do not expand formats in this scope.
- Use phased deprecation:
  - Add parity in `/preferences`.
  - Hide old dashboard import panels (or replace with link to `/preferences`).
  - Remove old panel code after a short validation window.

---

## Resolved Questions

- Should `/preferences` support both physician and admin import use cases?  
  Yes, both.
- Should old dashboard import panels remain after parity ships?  
  Phase them out (hide first, then remove after validation).

---

## Open Questions

None.

---

## Next Steps

Proceed to `/prompts:workflows-plan` to define file-level changes, component boundaries, role-specific UX states, and rollout verification.
