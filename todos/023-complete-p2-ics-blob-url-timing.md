---
status: complete
priority: p2
issue_id: "023"
tags: [code-review, ics-export, frontend-race, ux]
---

# ICS download blob URL revoked after 1s guess — can break on slow connections, no double-click guard

## Problem Statement
`ics-export-button.tsx` revokes the blob object URL after a hardcoded 1000ms timeout. On slow mobile browsers the download has not started yet at 1 second — the URL is revoked before the browser fetches it, producing a blank or failed `.ics` file. Double-clicking the export button creates two blob URLs with no guard against concurrent exports.

## Findings
- `ics-export-button.tsx` lines 127–137: `setTimeout(() => URL.revokeObjectURL(url), 1000)`
- No `isExporting` state guard on the export button
- 1000ms is arbitrary and undocumented

## Proposed Solutions

### Option A: 60s timeout + isExporting guard (Recommended)
**Effort:** Small | **Risk:** Low
```ts
// Generous timeout — blob URLs are in-process memory, cost is trivial
setTimeout(() => URL.revokeObjectURL(url), 60_000)

// Button guard
const [isExporting, setIsExporting] = useState(false)
const handleExport = () => {
  if (isExporting) return
  setIsExporting(true)
  try { downloadIcs(...) } finally { setIsExporting(false) }
}
```

### Option B: Use anchor `load` event for revocation
**Effort:** Medium | **Risk:** Medium
Browser-native signal but inconsistently supported across browsers for programmatic clicks.

## Acceptance Criteria
- [ ] Blob URL not revoked until well after download initiation (≥60s)
- [ ] Double-clicking export button does not create multiple downloads
- [ ] Button shows loading state during export

## Work Log
2026-02-17 — Identified by frontend-races-reviewer agent.
