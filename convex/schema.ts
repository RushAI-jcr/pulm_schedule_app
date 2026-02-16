import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  // ========================================
  // USERS & ROLES
  // ========================================
  physicians: defineTable({
    userId: v.optional(v.string()), // WorkOS user ID from AuthKit (e.g., "user_01...")
    firstName: v.string(),
    lastName: v.string(),
    initials: v.string(), // e.g., "JCR", "BM"
    email: v.string(),
    role: v.union(v.literal("physician"), v.literal("admin")),
    isActive: v.boolean(),
  })
    .index("by_userId", ["userId"])
    .index("by_initials", ["initials"])
    .index("by_email", ["email"])
    .index("by_role", ["role"]),

  // ========================================
  // FISCAL YEAR CONFIGURATION
  // ========================================
  fiscalYears: defineTable({
    label: v.string(), // e.g., "FY27"
    startDate: v.string(), // ISO date "2026-06-29"
    endDate: v.string(), // ISO date "2027-06-27"
    status: v.union(
      v.literal("setup"),      // Admin configuring rotations/cFTE
      v.literal("collecting"),  // Physicians submitting requests
      v.literal("building"),    // Admin building calendar
      v.literal("published"),   // Final calendar published
      v.literal("archived")
    ),
    requestDeadline: v.optional(v.string()), // ISO datetime
  })
    .index("by_status", ["status"]),

  weeks: defineTable({
    fiscalYearId: v.id("fiscalYears"),
    weekNumber: v.number(), // 1–52
    startDate: v.string(), // ISO date (Monday)
    endDate: v.string(), // ISO date (Sunday)
  })
    .index("by_fiscalYear", ["fiscalYearId"])
    .index("by_fiscalYear_weekNumber", ["fiscalYearId", "weekNumber"]),

  // ========================================
  // CALENDAR EVENTS (Holidays, Conferences, Observances)
  // Admin-curated: pulled from API + manually added
  // ========================================
  calendarEvents: defineTable({
    fiscalYearId: v.id("fiscalYears"),
    weekId: v.id("weeks"), // which week this falls in
    date: v.string(), // ISO date of the actual event
    name: v.string(), // e.g., "Independence Day", "CHEST"
    category: v.union(
      v.literal("federal_holiday"),    // from Nager.Date API
      v.literal("religious_observance"), // from Calendarific API
      v.literal("cultural_observance"), // from Calendarific API
      v.literal("conference"),          // admin-added (CHEST, SCCM, ATS, etc.)
      v.literal("other")               // admin-added custom
    ),
    source: v.union(
      v.literal("nager_api"),      // auto-imported from Nager.Date
      v.literal("calendarific"),   // auto-imported from Calendarific
      v.literal("admin_manual")    // manually added by admin
    ),
    isApproved: v.boolean(), // Admin must approve API-imported events before they show
    isVisible: v.boolean(),  // Admin can hide events that aren't relevant
    addedBy: v.optional(v.string()), // admin who approved/added
  })
    .index("by_fiscalYear", ["fiscalYearId"])
    .index("by_week", ["weekId"])
    .index("by_fiscalYear_approved", ["fiscalYearId", "isApproved"]),

  // ========================================
  // TRADE/SWAP REQUESTS (Mid-year changes)
  // ========================================
  tradeRequests: defineTable({
    fiscalYearId: v.id("fiscalYears"),
    masterCalendarId: v.id("masterCalendars"),
    requestingPhysicianId: v.id("physicians"), // who initiates the trade
    targetPhysicianId: v.id("physicians"),      // who they want to swap with
    // What the requester is giving up:
    requesterWeekId: v.id("weeks"),
    requesterRotationId: v.id("rotations"),
    // What they want in return:
    targetWeekId: v.id("weeks"),
    targetRotationId: v.id("rotations"),
    status: v.union(
      v.literal("proposed"),       // requester submitted
      v.literal("peer_accepted"),  // target physician agreed
      v.literal("peer_declined"),  // target physician declined
      v.literal("admin_approved"), // admin approved the swap
      v.literal("admin_denied"),   // admin denied the swap
      v.literal("cancelled")       // requester cancelled
    ),
    reason: v.optional(v.string()),
    adminNotes: v.optional(v.string()),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_fiscalYear", ["fiscalYearId"])
    .index("by_requesting_physician", ["requestingPhysicianId"])
    .index("by_target_physician", ["targetPhysicianId"])
    .index("by_status", ["status"]),

  // ========================================
  // ROTATION CONFIGURATION (Admin-set annually)
  // ========================================
  rotations: defineTable({
    fiscalYearId: v.id("fiscalYears"),
    name: v.string(), // "Pulm", "MICU 1", etc.
    abbreviation: v.string(), // display abbreviation
    cftePerWeek: v.number(), // e.g., 0.020
    minStaff: v.number(), // required physicians per week
    maxConsecutiveWeeks: v.number(),
    sortOrder: v.number(), // column order in calendar grid
    isActive: v.boolean(),
  })
    .index("by_fiscalYear", ["fiscalYearId"])
    .index("by_fiscalYear_name", ["fiscalYearId", "name"]),

  // ========================================
  // CLINIC CONFIGURATION (Admin-set annually)
  // ========================================
  clinicTypes: defineTable({
    fiscalYearId: v.id("fiscalYears"),
    name: v.string(), // e.g., "Pulmonary Clinic", "Sleep Clinic"
    cftePerHalfDay: v.number(), // e.g., 0.005
    isActive: v.boolean(),
  })
    .index("by_fiscalYear", ["fiscalYearId"]),

  // Per-physician clinic assignments (Admin-set)
  physicianClinics: defineTable({
    physicianId: v.id("physicians"),
    clinicTypeId: v.id("clinicTypes"),
    fiscalYearId: v.id("fiscalYears"),
    halfDaysPerWeek: v.number(), // e.g., 2
    activeWeeks: v.number(), // e.g., 42 (weeks they hold clinic)
  })
    .index("by_physician_fy", ["physicianId", "fiscalYearId"])
    .index("by_fiscalYear", ["fiscalYearId"]),

  // Per-physician cFTE target (Admin-set)
  physicianCfteTargets: defineTable({
    physicianId: v.id("physicians"),
    fiscalYearId: v.id("fiscalYears"),
    targetCfte: v.number(), // e.g., 0.60
  })
    .index("by_physician_fy", ["physicianId", "fiscalYearId"])
    .index("by_fiscalYear", ["fiscalYearId"]),

  // ========================================
  // SCHEDULE REQUESTS (Physician-submitted)
  // ========================================
  scheduleRequests: defineTable({
    physicianId: v.id("physicians"),
    fiscalYearId: v.id("fiscalYears"),
    status: v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("revised")
    ),
    submittedAt: v.optional(v.number()), // timestamp
    specialRequests: v.optional(v.string()), // free text
  })
    .index("by_physician_fy", ["physicianId", "fiscalYearId"])
    .index("by_fiscalYear", ["fiscalYearId"])
    .index("by_fiscalYear_status", ["fiscalYearId", "status"]),

  weekPreferences: defineTable({
    scheduleRequestId: v.id("scheduleRequests"),
    weekId: v.id("weeks"),
    availability: v.union(
      v.literal("green"),  // "OK to work this week"
      v.literal("yellow"), // "Prefer not to work this week"
      v.literal("red")     // "Do not schedule me this week" (vacation or conferences)
    ),
    reasonCategory: v.optional(
      v.union(
        v.literal("vacation"),           // official vacation / PTO
        v.literal("conference"),         // attending a conference (CHEST, SCCM, etc.)
        v.literal("personal_religious"), // personal or religious observance
        v.literal("admin_leave"),        // administrative leave
        v.literal("other")
      )
    ),
    reasonText: v.optional(v.string()), // e.g., conference name, holiday name
  })
    .index("by_request", ["scheduleRequestId"])
    .index("by_week", ["weekId"]),

  rotationPreferences: defineTable({
    scheduleRequestId: v.id("scheduleRequests"),
    rotationId: v.id("rotations"),
    preferenceRank: v.optional(v.number()), // 1 = most preferred, null = no preference
    avoid: v.boolean(), // true = physician wants to avoid this rotation
    avoidReason: v.optional(v.string()),
  })
    .index("by_request", ["scheduleRequestId"]),

  // ========================================
  // MASTER CALENDAR (Admin-built)
  // ========================================
  masterCalendars: defineTable({
    fiscalYearId: v.id("fiscalYears"),
    version: v.number(), // incremented on each save
    status: v.union(
      v.literal("draft"),
      v.literal("published")
    ),
    publishedAt: v.optional(v.number()),
  })
    .index("by_fiscalYear", ["fiscalYearId"]),

  // Each cell in the 52×8 grid
  assignments: defineTable({
    masterCalendarId: v.id("masterCalendars"),
    weekId: v.id("weeks"),
    rotationId: v.id("rotations"),
    physicianId: v.optional(v.id("physicians")), // null = unassigned
    assignedBy: v.optional(v.id("physicians")), // admin who made the assignment
    assignedAt: v.optional(v.number()), // timestamp
  })
    .index("by_calendar", ["masterCalendarId"])
    .index("by_calendar_week", ["masterCalendarId", "weekId"])
    .index("by_calendar_physician", ["masterCalendarId", "physicianId"])
    .index("by_calendar_week_rotation", ["masterCalendarId", "weekId", "rotationId"]),

  // ========================================
  // AUDIT LOG
  // ========================================
  auditLog: defineTable({
    fiscalYearId: v.id("fiscalYears"),
    userId: v.id("physicians"),
    action: v.string(), // e.g., "assignment_created", "cfte_updated", "request_submitted"
    entityType: v.string(), // e.g., "assignment", "physicianCfteTarget"
    entityId: v.string(), // ID of the changed record
    before: v.optional(v.string()), // JSON snapshot
    after: v.optional(v.string()), // JSON snapshot
    timestamp: v.number(),
  })
    .index("by_fiscalYear", ["fiscalYearId"])
    .index("by_user", ["userId"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
