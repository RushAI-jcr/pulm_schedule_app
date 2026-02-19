# Scheduler Inbox + Iterative Draft Calendar (No Email Provider)

**Date:** 2026-02-19  
**Status:** Brainstorm complete  
**Scope:** Annual request intake and admin scheduling workflow without Resend/email dependency

---

## What We're Building

An in-app-only annual scheduling workflow where:

- Physicians submit and revise requests in the existing preference wizard.
- Only admins (scheduler/MD) can build and edit the annual master calendar.
- Admin can draft early, continue reshuffling as requests arrive, and apply manual judgment.
- Revised physician submissions generate in-app admin awareness (badge + review section), not email.

The goal is to keep calendar creation fluid while preserving human control over final assignments.

---

## Current-State Audit (From Repo)

- Physician request flow already exists:
  - `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/app/(authenticated)/preferences/page.tsx`
  - `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/components/wizard/review-submit-step.tsx`
  - Backend in `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/convex/functions/scheduleRequests.ts`
- Admin queue already exists:
  - `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/app/(authenticated)/admin/requests/page.tsx`
- Admin draft calendar tooling already exists (draft, auto-fill, manual edits, publish):
  - `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/app/(authenticated)/admin/calendar/page.tsx`
  - `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/convex/functions/masterCalendar.ts`
- No implemented notification/inbox backend currently (only planning references).

---

## Approaches Considered

### Approach A: Minimal Queue Overlay
Use existing request statuses and add only a simple admin “new/revised” filter.

**Pros:** Fastest, low risk.  
**Cons:** Weak guidance for reshuffle impact; less scheduler support.

### Approach B: Scheduler Inbox + Suggested Reshuffle Preview (Recommended)
Add an explicit scheduler inbox board and conflict-aware suggested changes preview (manual approve only).

**Pros:** Strong admin workflow without automation risk, fits current architecture.  
**Cons:** Moderate added logic/state.

### Approach C: Full Auto-Reoptimization Loop
Automatically re-run optimization after every new/revised request and propose broad diffs.

**Pros:** Most automated.  
**Cons:** High complexity, harder trust/debug story, more churn than needed now.

**Recommendation:** Approach B (YAGNI-balanced, human-in-control, operationally clear).

---

## Key Decisions

- Intake channel: **In-app physician submissions only** (no Resend/email dependency).
- Calendar ownership: **Admin-only** build/edit for annual schedule.
- Draft timing: **Flexible**; scheduler can draft anytime and iteratively revise.
- Non-submitter default: **Use prior fiscal-year pattern** (availability + rotation preferences); fallback to all green if no prior data.
- Post-submit edits: **Allowed** until window closes; revisions should notify admin in-app.
- Admin intake UX: **Scheduler Inbox board** with per-physician status (`not_started`, `draft`, `submitted`, `revised`), last updated, and “open request”.
- Admin awareness: **Sidebar badge + “new/revised since last review” section** in admin requests.
- Conflict handling: **Generate suggested reshuffle preview**, admin explicitly approves.

---

## Resolved Questions

- Should this rely on email providers? **No** (in-app only).
- Can admin keep reshuffling as requests come in? **Yes**.
- Who builds annual calendar? **Admin only**.
- What happens when revised requests conflict with draft? **Suggest, don’t auto-apply**.

## Open Questions

None.

---

## Next Steps

Proceed to planning with:

- New scheduler inbox model and review-state tracking.
- Prior-year defaults seeding rules for non-submitters.
- Draft-impact detection and suggestion preview contract.
- Admin UI updates in `/admin/requests` and `/admin/calendar`.
