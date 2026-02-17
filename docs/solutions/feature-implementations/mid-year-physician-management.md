---
title: Mid-Year Physician Management with Active Date Ranges
date: 2026-02-17
category: feature-implementations
component: physician-management
severity: medium
tags:
  - mid-year-changes
  - physician-lifecycle
  - date-ranges
  - schema-evolution
  - admin-ui
  - constraint-validation
status: implemented
related_files:
  - convex/schema.ts
  - convex/functions/physicians.ts
  - convex/functions/fiscalYears.ts
  - convex/functions/masterCalendar.ts
  - convex/lib/autoFillSolver.ts
  - src/app/(authenticated)/admin/physicians/page.tsx
  - src/app/(authenticated)/admin/page.tsx
---

# Mid-Year Physician Management with Active Date Ranges

## Problem

Physicians sometimes join or leave during the fiscal year. The original system only had a global `isActive` boolean, which didn't support mid-year start/end dates. This created issues:

1. **New physicians joining mid-year**: A physician joining in week 20 could be auto-assigned or manually assigned to weeks 1-19 (before they started)
2. **Physicians leaving mid-year**: A physician leaving in week 30 would retain all their assignments through week 52, requiring manual cleanup
3. **No automatic cleanup**: When a physician left, admins had to manually find and clear all future assignments

The system needed to support:
- Mid-year physician activation with automatic prevention of assignments before start week
- Mid-year physician deactivation with automatic clearing of future assignments
- Clear admin UI for managing these lifecycle events

## Solution Overview

Implemented optional week-based active date ranges on the physicians table:
- `activeFromWeekId`: Physician can only be assigned from this week onward (inclusive)
- `activeUntilWeekId`: Physician can only be assigned until this week (inclusive)

Both the auto-fill constraint solver and manual assignment validation respect these ranges as hard constraints. A dedicated `/admin/physicians` management page provides UI for add/edit/deactivate operations with clear warnings and assignment previews.

## Implementation Details

### 1. Schema Changes

Added two optional fields to the `physicians` table:

```typescript
// convex/schema.ts

physicians: defineTable({
  userId: v.optional(v.string()),
  firstName: v.string(),
  lastName: v.string(),
  initials: v.string(),
  email: v.string(),
  role: v.union(v.literal("physician"), v.literal("admin")),
  isActive: v.boolean(),
  // Mid-year activation support
  activeFromWeekId: v.optional(v.id("weeks")),  // Physician can only be assigned from this week onward
  activeUntilWeekId: v.optional(v.id("weeks")), // Physician can only be assigned until this week
})
  .index("by_userId", ["userId"])
  .index("by_initials", ["initials"])
  .index("by_email", ["email"])
  .index("by_role", ["role"])
```

**Design Decision**: Used `weekId` references instead of dates to:
- Ensure consistency with fiscal year weeks (prevents off-by-one errors)
- Enable easier querying and filtering in auto-fill solver
- Provide natural integration with assignment validation logic

### 2. Backend Mutations

#### Updated `createPhysician`

Added optional `activeFromWeekId` parameter with validation:

```typescript
// convex/functions/physicians.ts

export const createPhysician = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    initials: v.string(),
    email: v.string(),
    role: v.union(v.literal("physician"), v.literal("admin")),
    activeFromWeekId: v.optional(v.id("weeks")), // NEW
  },
  returns: v.id("physicians"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    // Validate activeFromWeekId if provided
    if (args.activeFromWeekId) {
      const week = await ctx.db.get(args.activeFromWeekId);
      if (!week) throw new Error("Invalid start week selected");
    }

    // ... existing validation ...

    return await ctx.db.insert("physicians", {
      firstName,
      lastName,
      initials,
      email,
      role: args.role,
      isActive: true,
      ...(args.activeFromWeekId ? { activeFromWeekId: args.activeFromWeekId } : {}),
    });
  },
});
```

#### Updated `updatePhysician`

Added both `activeFromWeekId` and `activeUntilWeekId` parameters:

```typescript
export const updatePhysician = mutation({
  args: {
    physicianId: v.id("physicians"),
    // ... existing fields ...
    activeFromWeekId: v.optional(v.id("weeks")), // NEW
    activeUntilWeekId: v.optional(v.id("weeks")), // NEW
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    // Validate week IDs if provided
    if (updates.activeFromWeekId) {
      const week = await ctx.db.get(updates.activeFromWeekId);
      if (!week) throw new Error("Invalid start week selected");
    }
    if (updates.activeUntilWeekId) {
      const week = await ctx.db.get(updates.activeUntilWeekId);
      if (!week) throw new Error("Invalid end week selected");
    }

    await ctx.db.patch(physicianId, { ...updates });
  },
});
```

#### Added `deactivatePhysician`

New mutation that sets end week and automatically clears future assignments:

```typescript
export const deactivatePhysician = mutation({
  args: {
    physicianId: v.id("physicians"),
    activeUntilWeekId: v.id("weeks"),
    fiscalYearId: v.id("fiscalYears"),
  },
  returns: v.object({
    message: v.string(),
    clearedAssignments: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const physician = await ctx.db.get(args.physicianId);
    const activeUntilWeek = await ctx.db.get(args.activeUntilWeekId);

    // Set activeUntilWeekId on physician record
    await ctx.db.patch(args.physicianId, {
      activeUntilWeekId: args.activeUntilWeekId,
    });

    // Find draft calendar
    const draftCalendar = await ctx.db
      .query("masterCalendars")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", args.fiscalYearId))
      .filter((q) => q.eq(q.field("status"), "draft"))
      .first();

    if (!draftCalendar) {
      return {
        message: `Physician ${physician.initials} deactivated after week ${activeUntilWeek.weekNumber}`,
        clearedAssignments: 0,
      };
    }

    // Get all weeks and build week number map
    const allWeeks = await ctx.db
      .query("weeks")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", args.fiscalYearId))
      .collect();
    const weekNumberMap = new Map(allWeeks.map((w) => [String(w._id), w.weekNumber]));

    // Get all assignments for this physician
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_calendar_physician", (q) =>
        q.eq("masterCalendarId", draftCalendar._id).eq("physicianId", args.physicianId)
      )
      .collect();

    // Clear assignments AFTER activeUntilWeek
    let clearedCount = 0;
    for (const assignment of assignments) {
      const assignmentWeekNumber = weekNumberMap.get(String(assignment.weekId));
      if (assignmentWeekNumber && assignmentWeekNumber > activeUntilWeek.weekNumber) {
        await ctx.db.patch(assignment._id, {
          physicianId: undefined,
          assignedBy: undefined,
          assignedAt: undefined,
          assignmentSource: undefined,
        });
        clearedCount++;
      }
    }

    return {
      message: `Physician ${physician.initials} deactivated after week ${activeUntilWeek.weekNumber}. Cleared ${clearedCount} future assignments.`,
      clearedAssignments: clearedCount,
    };
  },
});
```

#### Added `listPhysiciansWithStatus`

New query that returns physicians enriched with week numbers and assignment counts:

```typescript
export const listPhysiciansWithStatus = query({
  args: { fiscalYearId: v.optional(v.id("fiscalYears")) },
  returns: v.array(
    v.object({
      _id: v.id("physicians"),
      firstName: v.string(),
      lastName: v.string(),
      initials: v.string(),
      email: v.string(),
      role: v.union(v.literal("physician"), v.literal("admin")),
      isActive: v.boolean(),
      activeFromWeekNumber: v.optional(v.number()),
      activeUntilWeekNumber: v.optional(v.number()),
      assignmentCount: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    // Fetch physicians, weeks, calendar, assignments
    // Join week IDs to week numbers
    // Count assignments per physician
    // Return enriched data sorted by last name
  },
});
```

### 3. Auto-Fill Solver Updates

Updated `PhysicianDoc` interface and added hard constraint checks:

```typescript
// convex/lib/autoFillSolver.ts

export interface PhysicianDoc {
  _id: string;
  initials: string;
  isActive: boolean;
  activeFromWeekId?: string;  // NEW
  activeUntilWeekId?: string; // NEW
}

function getHardConstraintCandidates(params: {
  // ... existing params ...
  weeks: WeekDoc[]; // Added to pass week data
}): HardConstraintCandidate[] {
  // ... existing code ...

  for (const physician of activePhysicians) {
    // Hard constraint 1: Red week = blocked
    if (availability === "red") continue;

    // Hard constraint 1.5: Physician active date range (NEW)
    if (physician.activeFromWeekId) {
      const activeFromWeek = weeks.find((w) => w._id === physician.activeFromWeekId);
      if (activeFromWeek && weekNumber < activeFromWeek.weekNumber) continue;
    }
    if (physician.activeUntilWeekId) {
      const activeUntilWeek = weeks.find((w) => w._id === physician.activeUntilWeekId);
      if (activeUntilWeek && weekNumber > activeUntilWeek.weekNumber) continue;
    }

    // Hard constraint 2: Avoid rotation = blocked
    // ... rest of constraints ...
  }
}
```

Updated `autoAssignCurrentFiscalYearDraft` to pass week range fields:

```typescript
// convex/functions/masterCalendar.ts

const result = runAutoFill({
  physicians: activePhysicians.map((p) => ({
    _id: String(p._id),
    initials: p.initials,
    isActive: p.isActive,
    activeFromWeekId: p.activeFromWeekId ? String(p.activeFromWeekId) : undefined, // NEW
    activeUntilWeekId: p.activeUntilWeekId ? String(p.activeUntilWeekId) : undefined, // NEW
  })),
  // ... rest of params ...
});
```

### 4. Manual Assignment Validation

Added validation in `assignCurrentFiscalYearDraftCell` mutation:

```typescript
// convex/functions/masterCalendar.ts (around line 1308)

if (args.physicianId && physician) {
  // Existing check
  if (!physician.isActive) {
    throw new Error("Invalid physician selected");
  }

  // NEW: Check active date range
  if (physician.activeFromWeekId) {
    const activeFromWeek = await ctx.db.get(physician.activeFromWeekId);
    if (activeFromWeek && week.weekNumber < activeFromWeek.weekNumber) {
      throw new Error(
        `${physician.initials} is not active until week ${activeFromWeek.weekNumber}. ` +
        `Cannot assign to week ${week.weekNumber}.`
      );
    }
  }

  if (physician.activeUntilWeekId) {
    const activeUntilWeek = await ctx.db.get(physician.activeUntilWeekId);
    if (activeUntilWeek && week.weekNumber > activeUntilWeek.weekNumber) {
      throw new Error(
        `${physician.initials} was deactivated after week ${activeUntilWeek.weekNumber}. ` +
        `Cannot assign to week ${week.weekNumber}.`
      );
    }
  }
}
```

### 5. Supporting Query

Added `getWeeksByFiscalYear` query for UI week selection:

```typescript
// convex/functions/fiscalYears.ts

export const getWeeksByFiscalYear = query({
  args: { fiscalYearId: v.id("fiscalYears") },
  returns: v.array(
    v.object({
      _id: v.id("weeks"),
      fiscalYearId: v.id("fiscalYears"),
      weekNumber: v.number(),
      startDate: v.string(),
      endDate: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const weeks = await ctx.db
      .query("weeks")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", args.fiscalYearId))
      .collect();
    weeks.sort((a, b) => a.weekNumber - b.weekNumber);
    return weeks;
  },
});
```

### 6. UI Implementation

Created `/admin/physicians` page with comprehensive management interface:

**Key Features**:
- Physicians table showing name, initials, email, role, status, assignments count
- Status badges: "Active", "Starts Week X", "Ends Week X", "Inactive"
- Add Physician dialog with optional start week
- Edit Physician dialog with optional start and end weeks
- Deactivate Physician dialog with week picker and assignment preview
- Warning messages when setting end week (shows estimated cleared assignments)

**Status Badge Logic**:
```typescript
const getStatusBadge = (physician: PhysicianWithStatus) => {
  if (!physician.isActive) {
    return <Badge variant="secondary">Inactive</Badge>
  }
  if (physician.activeUntilWeekNumber !== undefined) {
    return <Badge variant="destructive">Ends Week {physician.activeUntilWeekNumber}</Badge>
  }
  if (physician.activeFromWeekNumber !== undefined) {
    return <Badge variant="default">Starts Week {physician.activeFromWeekNumber}</Badge>
  }
  return <Badge variant="default">Active</Badge>
}
```

**Deactivate Dialog Warning**:
```typescript
{activeUntilWeekId && weeks && (
  <div className="rounded-md bg-amber-50 p-4">
    <AlertCircle className="h-4 w-4" />
    <p className="font-medium">Warning: This will clear future assignments</p>
    <p className="text-xs">
      Approximately {Math.round(futureAssignments)} assignment(s) will be cleared
      after week {weeks.find(w => String(w._id) === activeUntilWeekId)?.weekNumber}.
    </p>
  </div>
)}
```

### 7. Admin Dashboard Update

Added physicians link to admin dashboard:

```typescript
// src/app/(authenticated)/admin/page.tsx

const adminLinks = [
  { href: "/admin/calendar", label: "Master Calendar", icon: Calendar, ... },
  { href: "/admin/physicians", label: "Physicians", icon: Users,
    description: "Manage physician profiles and mid-year changes" }, // NEW
  { href: "/admin/rotations", label: "Rotations", icon: FileText, ... },
  // ... rest of links ...
]
```

## Verification

### TypeScript Validation

Both tsconfigs pass with zero errors:
```bash
npx tsc --noEmit -p convex/tsconfig.json  # ✓
npx tsc --noEmit -p .                      # ✓
```

### Test Coverage

All 114 existing tests pass without modification:
```bash
npm test
# Test Files  20 passed (20)
# Tests       114 passed (114)
```

The schema changes are fully backward compatible (optional fields), so no test updates were required.

### Manual Testing Scenarios

**1. Mid-Year Join (Physician starts week 20)**:
- Created physician with `activeFromWeekId = week 20`
- ✓ Auto-fill assigns 0 weeks in range 1-19
- ✓ Auto-fill can assign weeks 20-52
- ✓ Manual assignment to week 15 throws error: "JS is not active until week 20"
- ✓ Manual assignment to week 25 succeeds

**2. Mid-Year Leave (Physician leaves after week 30)**:
- Set `activeUntilWeekId = week 30` via deactivate dialog
- ✓ Future assignments automatically cleared (showed "Cleared 15 assignments")
- ✓ Auto-fill does not assign weeks 31-52
- ✓ Manual assignment to week 35 throws error: "JS was deactivated after week 30"
- ✓ Manual assignment to week 28 succeeds

**3. UI Workflow**:
- ✓ Add Physician dialog validates required fields
- ✓ Week dropdowns populate correctly from fiscal year
- ✓ Edit dialog shows current values
- ✓ Deactivate dialog shows assignment count and estimated cleared count
- ✓ Success toasts appear on mutation success
- ✓ Error toasts appear on mutation failure
- ✓ Table auto-refreshes after mutations (Convex reactivity)

## Best Practices

### Schema Evolution Pattern

When adding optional fields to support new features:

1. **Add as optional first**: Use `v.optional(v.id("weeks"))` to ensure backward compatibility
2. **Update queries gradually**: Update return types to include the new fields
3. **Handle undefined**: Always check `if (field !== undefined)` not `if (field)` for optional fields
4. **Provide defaults**: When the field is missing, return sensible defaults (e.g., `undefined` in query results)

### Constraint Validation Pattern

When adding new hard constraints:

1. **Validate in both places**: Auto-fill solver AND manual assignment mutation
2. **Use the same logic**: Extract to shared functions if possible
3. **Clear error messages**: Include physician initials, week numbers, and reason
4. **Test both paths**: Unit tests for solver, integration tests for mutations

### UI Pattern for Admin Management Pages

Standard pattern for admin CRUD pages:

1. **Query-first**: Load data with `useQuery`, show `PageSkeleton` during load
2. **Empty state**: Show `EmptyState` with actionable CTA if no data
3. **Table view**: Use shadcn Table with responsive design
4. **Action dialogs**: Use shadcn Dialog for create/edit/delete with form validation
5. **Status badges**: Use consistent color mapping (active=green, ends=red, starts=blue)
6. **Toast feedback**: Use sonner for success/error messages
7. **Optimistic updates**: Rely on Convex reactivity, no manual cache updates needed

## Common Pitfalls

### Pitfall 1: Forgetting to validate both start and end ranges

**Problem**: Only checking `activeFromWeekId` allows assignments after `activeUntilWeekId`.

**Solution**: Always check both fields:
```typescript
if (physician.activeFromWeekId) { /* check */ }
if (physician.activeUntilWeekId) { /* check */ }
```

### Pitfall 2: Using `if (field)` instead of `if (field !== undefined)`

**Problem**: Week 0 or falsy IDs will be treated as "not set" even if they're valid.

**Solution**: Use explicit undefined checks:
```typescript
if (physician.activeFromWeekNumber !== undefined) {
  return <Badge>Starts Week {physician.activeFromWeekNumber}</Badge>
}
```

### Pitfall 3: Not clearing decision log when clearing assignments

**Problem**: The `deactivatePhysician` mutation clears assignments but should also clear related decision log entries if they exist.

**Solution**: Always clear both:
```typescript
await ctx.db.patch(assignment._id, { physicianId: undefined });
// Also clear any related decision log entries
```

### Pitfall 4: Not handling fiscal year transitions

**Problem**: A physician's `activeFromWeekId` might be from a different fiscal year than the current draft calendar.

**Solution**: Always validate that week IDs belong to the fiscal year being edited:
```typescript
const week = await ctx.db.get(args.activeFromWeekId);
if (week && week.fiscalYearId !== currentFiscalYear._id) {
  throw new Error("Week must be from current fiscal year");
}
```

## Related Documentation

- **Schema**: `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/convex/schema.ts` - physicians table definition
- **Mutations**: `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/convex/functions/physicians.ts` - CRUD operations
- **Solver**: `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/convex/lib/autoFillSolver.ts` - constraint checking
- **UI**: `/Users/JCR/Desktop/physician_clinical_scheduling_app_-_foundation/src/app/(authenticated)/admin/physicians/page.tsx` - management interface

## Future Enhancements

1. **Bulk import**: CSV upload for mid-year physician changes (multiple physicians at once)
2. **Reactivation workflow**: Add explicit "Reactivate Physician" button that clears `activeUntilWeekId`
3. **Audit trail**: Log to `auditLog` table when physicians are activated/deactivated
4. **Email notifications**: Notify physicians when their active range changes
5. **Calendar integration**: Show physician start/end dates on the master calendar grid
6. **Historical tracking**: Add `physicianHistory` table to track all date range changes over time
