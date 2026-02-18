# Brainstorm: FY2025-2026 Calendar Import from Excel

**Date:** 2026-02-18
**Status:** Ready for planning
**Feature:** One-time import of the existing FY2025-2026 Excel schedule into the app to serve as reference for building FY2026-2027

---

## What We're Building

A one-time data import pipeline that reads `Faculty Schedule 2025-2026.xlsx` and populates the FY2025-2026 master calendar in the Convex database — giving the app accurate historical assignments to reference while building next year's schedule.

---

## Excel File Analysis

**File:** `/Users/JCR/Downloads/Recents/Faculty Schedule 2025-2026.xlsx`
**Sheet:** `Rotation` (single sheet)
**Structure:** Grid — weeks as rows, rotations as columns, physician initials in cells

### Columns
| Column | Header | Maps to `rotation.name` |
|--------|--------|--------------------------|
| A | (week start date) | — |
| B | (week end date) | — |
| C | Pulm | Pulmonary Consults |
| D | MICU 1 | MICU 1 |
| E | MICU 2 | MICU 2 |
| F | AICU | AICU |
| G | LTAC | LTAC |
| H | ROPH | ROPH |
| I | IP | IP |
| J | PFT | PFT |
| K | Holidays | (informational only) |

### Data rows
- **Rows 1–54**: 54 weeks from 2025-06-23 to 2026-07-05
- **Rows 56–80**: Initials legend (AK = Akshay Kohli, etc.) — skip during import
- **25 physicians**, all matching initials already in the database

### Data quality issues to handle
1. **Row 47 (week of 2026-05-11)** — Pulm cell reads `"SP covering for EP"` instead of clean initials. Must extract `"SP"` via regex (`/^([A-Z]+)/`).
2. **Row 54 (week of 2026-06-29)** — all assignment cells are empty. Last partial week; import as blank (no assignments).
3. **Only "Pulm" needs abbreviation mapping** — all other rotation column headers already match `rotation.name` exactly (MICU 1, MICU 2, AICU, LTAC, ROPH, IP, PFT).

---

## Existing Infrastructure

### Backend — already ready
- `convex/functions/masterCalendar.ts` → `importCurrentFiscalYearMasterCalendarFromRows` — public mutation that accepts `{ rows: [{weekStart, assignments: [{rotationName, physicianInitials}]}], replaceExisting? }`. Matches physicians by `initials` and rotations by `name` (case-insensitive). Returns counts of unknown/unmatched items.
- `assignments.assignmentSource = "import"` — schema already anticipates this.
- `convex/lib/scheduleImport.ts` — fuzzy matching helpers reusable.

### Backend — gaps
- `importCurrentFiscalYearMasterCalendarFromRows` requires `requireAdmin` auth — cannot be called unauthenticated from a plain Node script.
- Alternative path: create an **internal** Convex mutation (like existing `seedRealCalendar:importRealCalendar`) that embeds the pre-parsed data and can be called via `npx convex run` without HTTP auth.

### Frontend — no UI needed
One-time import only; no upload UI required.

---

## Chosen Approach: Two-Step Script + Internal Seed Mutation

### Step 1 — Parse script (local Node.js, not deployed)
`scripts/parse-fy2526-excel.ts`
- Reads the Excel file using `xlsx` (already in `node_modules`)
- Maps `"Pulm"` → `"Pulmonary Consults"`; all others pass through unchanged
- Cleans initials: extracts leading uppercase letters from cells like `"SP covering for EP"` → `"SP"`
- Skips rows 55+ (legend rows with blank dates)
- Outputs a JSON file: `scripts/fy2526-import-data.json`

### Step 2 — Convex internal seed mutation
`convex/functions/seedFY2526Calendar.ts`
- `internalMutation` that reads the pre-parsed JSON (embedded as a TypeScript constant)
- Calls the existing import logic (or directly calls `importCurrentFiscalYearMasterCalendarFromRows` internally)
- Called via: `npx convex run functions/seedFY2526Calendar:importFY2526`
- No auth barrier — internal functions bypass auth guards

### Pre-requisite: FY2025-2026 must exist in the database
Before import, verify the FY record and 54 weeks exist. The existing `seedRealCalendar:importRealCalendar` may have already created this. If data is incomplete/wrong, the `replaceExisting: true` flag will overwrite existing assignments.

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| One-time vs. reusable | One-time script | No need for upload UI now; YAGNI |
| Auth barrier bypass | Internal Convex mutation + `npx convex run` | Simpler than authenticating a Node.js HTTP client |
| Abbreviation mapping | In parse script | Keeps backend mutation generic; single mapping point |
| Data cleaning | Regex `^([A-Z]+)` on initials | Handles "SP covering for EP" without special-casing |
| `replaceExisting` | `true` | Fresh start — wipe incorrect existing assignments |

---

## Resolved Questions

- **Is data one-time or reusable?** → One-time import only.
- **Excel format?** → Grid: weeks=rows, rotations=columns, initials=cells.
- **Physician identifier?** → Initials (already in db: AK, AG, AT, BM, BS, DPG, EC, EP, JCR, JEK, JG, JK, JN, JR, KB, KJ, KS, MS, MT, MV, MY, PN, SF, SP, WL).
- **Rotation labels?** → Abbreviations in Excel; only "Pulm" differs from `rotation.name`.

## Open Questions

- None — ready for planning.

---

## Success Criteria

1. All 53 assigned weeks (1–53) have correct physician initials per rotation in the app calendar view.
2. Week 54 (2026-06-29) is present but blank.
3. `assignmentSource = "import"` on all imported records.
4. `npx convex run` completes with zero `unknownPhysicianInitials` and zero `unknownRotationNames`.
5. The FY2025-2026 calendar is visible and accurate in the admin calendar UI for reference.
