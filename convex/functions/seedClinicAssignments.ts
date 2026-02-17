import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Seed clinic half-day assignments for imported FY 2025-2026 physicians
 *
 * Each clinic half-day = 0.125 cFTE (12.5%)
 * Physicians have 1-4 clinic half-days per week
 *
 * Run: npx convex run functions/seedClinicAssignments:addClinicAssignments
 */
export const addClinicAssignments = mutation({
  args: {},
  returns: v.object({
    clinicTypeId: v.id("clinicTypes"),
    assignmentsCreated: v.number(),
    cfteTargetsCreated: v.number(),
  }),
  handler: async (ctx) => {
    // Get the FY 2025-2026 fiscal year
    const fiscalYear = await ctx.db
      .query("fiscalYears")
      .filter((q) => q.eq(q.field("label"), "FY 2025-2026"))
      .first();

    if (!fiscalYear) {
      throw new Error("FY 2025-2026 not found. Run seedRealCalendar first.");
    }

    // Create a general clinic type
    const clinicTypeId = await ctx.db.insert("clinicTypes", {
      fiscalYearId: fiscalYear._id,
      name: "General Clinic",
      cftePerHalfDay: 0.125, // 12.5% per half-day
      isActive: true,
    });

    // Get all physicians
    const physicians = await ctx.db.query("physicians").collect();

    // Assign clinic half-days to each physician
    // Distribution (default = 3 half-days = 0.375 cFTE clinic):
    // - 15 physicians with 3 half-days (default)
    // - 5 physicians with 2 half-days (lighter clinic load)
    // - 3 physicians with 4 half-days (heavy clinic load)
    // - 2 physicians with 1 half-day (minimal clinic)

    const clinicAssignments = [
      // 3 half-days - DEFAULT (15 physicians)
      { initials: "AG", halfDays: 3, targetCfte: 0.55 },
      { initials: "AK", halfDays: 3, targetCfte: 0.50 },
      { initials: "AT", halfDays: 3, targetCfte: 0.50 },
      { initials: "BM", halfDays: 3, targetCfte: 0.60 },
      { initials: "EP", halfDays: 3, targetCfte: 0.55 },
      { initials: "JCR", halfDays: 3, targetCfte: 0.50 },
      { initials: "JEK", halfDays: 3, targetCfte: 0.55 },
      { initials: "JG", halfDays: 3, targetCfte: 0.50 },
      { initials: "JK", halfDays: 3, targetCfte: 0.50 },
      { initials: "KJ", halfDays: 3, targetCfte: 0.55 },
      { initials: "KS", halfDays: 3, targetCfte: 0.50 },
      { initials: "MS", halfDays: 3, targetCfte: 0.50 },
      { initials: "MT", halfDays: 3, targetCfte: 0.55 },
      { initials: "MV", halfDays: 3, targetCfte: 0.55 },
      { initials: "MY", halfDays: 3, targetCfte: 0.55 },

      // 2 half-days (5 physicians)
      { initials: "BS", halfDays: 2, targetCfte: 0.45 },
      { initials: "JN", halfDays: 2, targetCfte: 0.45 },
      { initials: "JR", halfDays: 2, targetCfte: 0.50 },
      { initials: "KB", halfDays: 2, targetCfte: 0.50 },
      { initials: "SF", halfDays: 2, targetCfte: 0.55 },

      // 4 half-days (3 physicians)
      { initials: "PN", halfDays: 4, targetCfte: 0.60 },
      { initials: "SP", halfDays: 4, targetCfte: 0.60 },
      { initials: "WL", halfDays: 4, targetCfte: 0.55 },

      // 1 half-day (2 physicians)
      { initials: "DPG", halfDays: 1, targetCfte: 0.60 },
      { initials: "EC", halfDays: 1, targetCfte: 0.40 },
    ];

    let assignmentsCreated = 0;
    let cfteTargetsCreated = 0;

    for (const assignment of clinicAssignments) {
      const physician = physicians.find(p => p.initials === assignment.initials);
      if (!physician) {
        console.warn(`Physician with initials ${assignment.initials} not found`);
        continue;
      }

      // Create clinic assignment
      await ctx.db.insert("physicianClinics", {
        physicianId: physician._id,
        clinicTypeId,
        fiscalYearId: fiscalYear._id,
        halfDaysPerWeek: assignment.halfDays,
        activeWeeks: 48, // Assume 48 weeks of clinic (4 weeks off for vacation/conferences)
      });
      assignmentsCreated++;

      // Create cFTE target
      await ctx.db.insert("physicianCfteTargets", {
        physicianId: physician._id,
        fiscalYearId: fiscalYear._id,
        targetCfte: assignment.targetCfte,
      });
      cfteTargetsCreated++;
    }

    return {
      clinicTypeId,
      assignmentsCreated,
      cfteTargetsCreated,
    };
  },
});
