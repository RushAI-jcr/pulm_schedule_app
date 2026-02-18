---
status: complete
priority: p3
issue_id: "009"
tags: [code-review, performance, schema, convex]
dependencies: []
---

# Add by_fiscalYear_status Index to masterCalendars Table

## Problem Statement

Across the codebase, draft and published calendars are found by querying `by_fiscalYear` then applying a JS `.filter()` on `status`. This violates the CLAUDE.md convention ("Use `.withIndex()` instead of `.filter()` for queries") and loads all calendar versions into memory to filter. While each fiscal year has at most 2-3 calendar versions today, the pattern is architecturally wrong and will become inefficient if calendar versioning is used more heavily.

The pattern appears in at least 6 places across `masterCalendar.ts`, `physicians.ts`, and `reports.ts`.

## Findings

**Location:** Multiple files, example from `physicians.ts:604-608`:
```typescript
const draftCalendar = await ctx.db
  .query("masterCalendars")
  .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYearId))
  .filter((q) => q.eq(q.field("status"), "draft"))  // ← post-index JS filter
  .first();
```

**Schema:** `convex/schema.ts:246-247` — only `by_fiscalYear` index, no `by_fiscalYear_status`.

## Proposed Solution

Add the compound index to the schema:
```typescript
masterCalendars: defineTable({...})
  .index("by_fiscalYear", ["fiscalYearId"])
  .index("by_fiscalYear_status", ["fiscalYearId", "status"])  // add this
```

Then replace `.filter()` calls with:
```typescript
.withIndex("by_fiscalYear_status", (q) =>
  q.eq("fiscalYearId", fiscalYearId).eq("status", "draft")
).first()
```

- **Effort:** Small (~30 min for schema + find/replace across codebase)
- **Risk:** Low (additive index)

## Acceptance Criteria

- [ ] `by_fiscalYear_status` index added to `masterCalendars` table in schema
- [ ] All `.filter((q) => q.eq(q.field("status"), ...))` on `masterCalendars` replaced with `.withIndex()`
- [ ] `npm run lint:convex` passes

## Work Log

- 2026-02-17: Identified by architecture agent (Priority 4) and performance agent (Priority 3). Minor but consistent convention violation.
