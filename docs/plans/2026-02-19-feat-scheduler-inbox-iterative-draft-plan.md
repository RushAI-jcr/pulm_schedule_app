---
title: "feat: Scheduler Inbox + Iterative Annual Draft Workflow (In-App Only)"
type: feat
date: 2026-02-19
brainstorm: docs/brainstorms/2026-02-19-scheduler-inbox-iterative-draft-brainstorm.md
---

# Scheduler Inbox + Iterative Annual Draft Workflow (In-App Only)

## Overview

Implement an admin-first annual scheduling workflow where physicians submit/revise requests in-app and admins iteratively build the annual draft as requests come in. No email provider integration is required. Admin awareness is handled by in-app inbox state and badges.

This plan extends existing request and master calendar flows:
- Physician request wizard in `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/app/(authenticated)/preferences/page.tsx`
- Admin request queue in `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/app/(authenticated)/admin/requests/page.tsx`
- Admin calendar builder in `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/app/(authenticated)/admin/calendar/page.tsx`

## Problem Statement

Current system already supports request submission and admin draft editing, but lacks:

1. A true scheduler inbox model for "new/revised since last review".
2. In-app admin notification badges for revised requests.
3. Prior-year defaults for non-submitters during iterative drafting.
4. Conflict-aware reshuffle suggestions when late revisions contradict current draft assignments.

Because this is an annual workflow with continuous manual adjustments, admins need operational visibility and targeted recommendations without forced auto-application.

## Product Decisions (Locked)

- Intake channel: in-app physician submissions only.
- Only admins build/edit annual calendar.
- Drafting is flexible and iterative.
- Non-submitter defaults: prior-year availability + rotation preferences, fallback to all-green availability.
- Physicians can revise after first submit; admin notified in-app.
- Admin intake UX: scheduler inbox board with per-physician status and last updated.
- Admin awareness: sidebar badge + "new/revised since last review" in requests.
- Conflict handling: generate suggestion preview; admin explicitly applies.

## Proposed Solution

Add an "inbox + review-state" layer over existing schedule requests and connect it to draft-calendar impact analysis.

### Core Additions

1. **Inbox state tracking**
   - Persist admin review checkpoints for each physician/fiscal year request thread.
   - Derive unread/new/revised counts server-side.

2. **Request activity timestamps**
   - Persist deterministic "last activity" on schedule requests for accurate sorting and badge logic.

3. **Prior-year fallback profile**
   - Build effective scheduling preference inputs for each physician from:
     - current request (if submitted/revised or draft exists),
     - otherwise previous fiscal year preferences,
     - otherwise all-green baseline.

4. **Draft conflict detection + suggestion preview**
   - Detect where revised preferences conflict with already assigned draft cells.
   - Generate ranked replacement suggestions using existing auto-fill scoring primitives.
   - Admin applies selected suggestions manually.

5. **Admin UX updates**
   - `/admin/requests`: scheduler inbox board + reviewed/unreviewed partitions.
   - `/admin/calendar`: pending-impact panel + suggestion preview/apply controls.
   - sidebar badge count for unreviewed request activity.

## Technical Approach

### Phase 1: Schema and Contracts

#### 1.1 Update `scheduleRequests` shape

File: `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/convex/schema.ts`

Add fields:
- `lastActivityAt: v.number()` (required moving forward)
- `revisionCount: v.optional(v.number())`

Behavior:
- Initialize on create (`getOrCreateRequest`) to `Date.now()`.
- Update on all save/import/submit/revise mutations.

#### 1.2 Add admin review-state table

File: `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/convex/schema.ts`

New table: `scheduleRequestInboxReview`
- `fiscalYearId: v.id("fiscalYears")`
- `physicianId: v.id("physicians")`
- `lastReviewedAt: v.number()`
- `reviewedBy: v.id("physicians")`
- `createdAt: v.number()`
- `updatedAt: v.number()`

Indexes:
- `by_fiscalYear` on `["fiscalYearId"]`
- `by_fiscalYear_physician` on `["fiscalYearId", "physicianId"]`
- `by_reviewer` on `["reviewedBy"]`

Purpose:
- Compute "new/revised since last review" robustly and cross-session.

### Phase 2: Request Activity + Inbox Queries

File: `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/convex/functions/scheduleRequests.ts`

#### 2.1 Activity stamping

Update these mutations to patch `lastActivityAt`:
- `saveMyScheduleRequest`
- `setMyWeekPreference`
- `batchSetWeekPreferences`
- `importWeekPreferencesFromUpload`
- `submitMyScheduleRequest`
- rotation preference mutations in `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/convex/functions/rotationPreferences.ts`

When status transitions from `submitted` to `revised`, increment `revisionCount`.

#### 2.2 New inbox endpoints

Add admin queries/mutations:
- `getAdminRequestInbox`
  - returns physician rows with:
    - current status (`not_started|draft|submitted|revised`)
    - `lastActivityAt`
    - `isNewOrRevisedSinceReview`
    - request completeness indicators
- `markAdminRequestThreadReviewed({ physicianId })`
- `markAllAdminRequestThreadsReviewed()`
- `getAdminRequestInboxBadgeCount()`

Type contracts should be strict `returns` validators (no `v.any` for inbox payloads).

### Phase 3: Prior-Year Defaults Resolution

Add helper:
- `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/convex/lib/requestDefaults.ts`

Responsibilities:
- For each physician in active FY, resolve effective request input:
  1. current FY request + preferences (preferred),
  2. previous FY request + preferences (fallback),
  3. all-green week availability + neutral rotation preferences (final fallback).

Expose metadata flags per physician:
- `source: "current" | "prior_year" | "baseline"`
- `isFallback: boolean`

Integrate into:
- draft auto-fill input preparation in `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/convex/functions/masterCalendar.ts`

### Phase 4: Conflict Detection + Suggestion Preview

#### 4.1 Conflict model

Conflicts for a physician with revised request:
- assigned week now marked red/unavailable,
- assignment violates new avoid/do-not-assign rotation preference,
- assignment strongly mismatched with updated preference ranking (soft conflict tier).

#### 4.2 New endpoints

Files:
- `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/convex/functions/masterCalendar.ts`
- optional helper in `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/convex/lib/autoFillScorer.ts`

Add:
- `getCurrentFiscalYearDraftConflictSuggestions`
  - returns impacted cells and ranked replacement suggestions
  - includes explanation payload for admin confidence
- `applyDraftConflictSuggestions`
  - applies selected suggestion set as manual assignments
  - writes audit log entries

No auto-apply background process.

### Phase 5: Admin UX

#### 5.1 Requests page inbox board

File: `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/app/(authenticated)/admin/requests/page.tsx`

Replace simple list-first rendering with:
- inbox status chips (not started/draft/submitted/revised),
- "New/Revised since last review" section pinned at top,
- per-physician row with:
  - last activity timestamp,
  - open request action,
  - mark reviewed action.

Keep existing trade approval and preference matrix tabs.

#### 5.2 Sidebar badge

File: `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/components/layout/app-sidebar.tsx`

Use `getAdminRequestInboxBadgeCount` query for admin-only badge near Requests nav.

#### 5.3 Calendar page impact panel

File: `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/app/(authenticated)/admin/calendar/page.tsx`

Add section:
- pending revised physicians count,
- open suggestion preview action,
- selective apply controls for suggested changes.

### Phase 6: Type-Safety Hardening (P2 Quality Gate)

Finding reference:
- `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/features/dashboard/components/App.tsx:1075`

Requirements:
- remove/avoid broad `as any` in newly touched request/admin flows.
- where legacy `any` remains in unrelated dashboard regions, isolate and incrementally replace with explicit DTO aliases before shipping inbox features that depend on those contracts.

Target files for this phase:
- `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/app/(authenticated)/admin/requests/page.tsx`
- `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/app/(authenticated)/admin/calendar/page.tsx`
- `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/features/dashboard/components/App.tsx` (only if shared contract code touched)

## Migration and Rollout

1. Deploy schema changes.
2. Run one-time admin/backfill mutation:
   - set `lastActivityAt` for existing requests using `submittedAt ?? _creationTime`.
   - initialize `revisionCount` when absent.
3. Deploy new inbox and badge read paths.
4. Deploy prior-year defaults + suggestion preview.
5. Enable admin UI controls.
6. Monitor audit log for apply operations and fallback source usage.

## Test Strategy

### Unit tests

Add or extend tests in `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/tests/`:
- inbox status derivation (`not_started|draft|submitted|revised`)
- badge count calculation vs `lastReviewedAt`
- prior-year fallback resolution paths
- conflict detection classification
- suggestion ranking determinism for identical inputs

### Integration tests

- physician submits then revises request -> admin badge increments
- admin marks reviewed -> badge decrements
- non-submitter included via prior-year fallback during draft auto-fill
- suggestion preview returns cells after revision conflicts
- apply suggestions updates assignments + audit entries

### Regression suite

- `npm run typecheck`
- `npm run test`
- `npm run build`
- targeted checks:
  - sign-in -> preferences submit -> admin requests -> admin calendar apply suggestion flow

## Acceptance Criteria

- Admin sees scheduler inbox board with per-physician status and last activity.
- Admin sees in-app unread badge count for new/revised request activity.
- Physicians can revise after submit; revisions appear as unread admin activity.
- Admin can mark one/all threads reviewed.
- Drafting works before all requests are submitted.
- Non-submitters are included using prior-year defaults (or baseline fallback).
- Revised request conflicts can generate suggestion preview.
- Suggestions are only applied via explicit admin action.
- No new Resend/email dependency introduced.
- Typecheck/test/build pass.

## Risks and Mitigations

1. **Over-aggressive conflict suggestions**
   - Mitigation: preview-only + explicit apply + audit logging.
2. **Fallback quality variance across years**
   - Mitigation: source flags (`current/prior_year/baseline`) shown in admin UI.
3. **Badge noise/fatigue**
   - Mitigation: reviewed markers at physician thread granularity + bulk mark reviewed.
4. **Contract drift from unsafe casts**
   - Mitigation: phase 6 type-safety gate and strict `returns` validators.

## Out of Scope

- Email/SMS notifications.
- Full autonomous re-optimization after each revision.
- Non-admin calendar editing permissions.
