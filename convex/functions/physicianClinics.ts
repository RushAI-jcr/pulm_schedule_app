import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "../lib/auth";
import { isValidActiveWeeks, isValidHalfDaysPerWeek } from "../lib/physicianClinics";
import { getSingleActiveFiscalYear } from "../lib/fiscalYear";

async function getCurrentFiscalYearForAdmin(ctx: any) {
  await requireAdmin(ctx);
  return await getSingleActiveFiscalYear(ctx);
}

export const getCurrentFiscalYearPhysicianClinics = query({
  args: {},
  handler: async (ctx) => {
    const fiscalYear = await getCurrentFiscalYearForAdmin(ctx);
    if (!fiscalYear) {
      return { fiscalYear: null, physicians: [], clinicTypes: [], assignments: [] };
    }

    const [physicians, clinicTypes, assignments] = await Promise.all([
      ctx.db.query("physicians").collect(),
      ctx.db
        .query("clinicTypes")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
      ctx.db
        .query("physicianClinics")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
        .collect(),
    ]);

    const activePhysicians = physicians
      .filter((physician) => physician.isActive)
      .sort((a, b) => {
        const byLast = a.lastName.localeCompare(b.lastName);
        if (byLast !== 0) return byLast;
        return a.firstName.localeCompare(b.firstName);
      })
      .map((physician) => ({
        _id: physician._id,
        fullName: `${physician.lastName}, ${physician.firstName}`,
        initials: physician.initials,
        role: physician.role,
      }));

    const sortedClinicTypes = clinicTypes.sort((a, b) => a.name.localeCompare(b.name));

    return {
      fiscalYear,
      physicians: activePhysicians,
      clinicTypes: sortedClinicTypes,
      assignments,
    };
  },
});

export const upsertPhysicianClinicAssignment = mutation({
  args: {
    physicianId: v.id("physicians"),
    clinicTypeId: v.id("clinicTypes"),
    halfDaysPerWeek: v.number(),
    activeWeeks: v.number(),
  },
  handler: async (ctx, args) => {
    const fiscalYear = await getCurrentFiscalYearForAdmin(ctx);
    if (!fiscalYear) throw new Error("No active fiscal year available");

    if (!isValidHalfDaysPerWeek(args.halfDaysPerWeek)) {
      throw new Error("Half-days/week must be an integer from 0 to 10");
    }
    if (!isValidActiveWeeks(args.activeWeeks)) {
      throw new Error("Active weeks must be an integer from 0 to 52");
    }
    if (args.halfDaysPerWeek === 0 || args.activeWeeks === 0) {
      throw new Error("Use remove assignment when half-days or active weeks is zero");
    }

    const [physician, clinicType] = await Promise.all([
      ctx.db.get(args.physicianId),
      ctx.db.get(args.clinicTypeId),
    ]);

    if (!physician || !physician.isActive) throw new Error("Physician not found");
    if (!clinicType || clinicType.fiscalYearId !== fiscalYear._id) {
      throw new Error("Clinic type not found for current fiscal year");
    }

    const existing = await ctx.db
      .query("physicianClinics")
      .withIndex("by_physician_fy_clinic", (q) =>
        q
          .eq("physicianId", args.physicianId)
          .eq("fiscalYearId", fiscalYear._id)
          .eq("clinicTypeId", args.clinicTypeId),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        halfDaysPerWeek: args.halfDaysPerWeek,
        activeWeeks: args.activeWeeks,
      });
      return { message: "Clinic assignment updated" };
    }

    await ctx.db.insert("physicianClinics", {
      physicianId: args.physicianId,
      clinicTypeId: args.clinicTypeId,
      fiscalYearId: fiscalYear._id,
      halfDaysPerWeek: args.halfDaysPerWeek,
      activeWeeks: args.activeWeeks,
    });

    return { message: "Clinic assignment created" };
  },
});

export const removePhysicianClinicAssignment = mutation({
  args: {
    physicianId: v.id("physicians"),
    clinicTypeId: v.id("clinicTypes"),
  },
  handler: async (ctx, args) => {
    const fiscalYear = await getCurrentFiscalYearForAdmin(ctx);
    if (!fiscalYear) throw new Error("No active fiscal year available");

    const existing = await ctx.db
      .query("physicianClinics")
      .withIndex("by_physician_fy_clinic", (q) =>
        q
          .eq("physicianId", args.physicianId)
          .eq("fiscalYearId", fiscalYear._id)
          .eq("clinicTypeId", args.clinicTypeId),
      )
      .first();
    if (!existing) {
      return { message: "No clinic assignment to remove" };
    }

    await ctx.db.delete(existing._id);
    return { message: "Clinic assignment removed" };
  },
});
