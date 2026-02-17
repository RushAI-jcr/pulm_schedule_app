import { mutation, query, QueryCtx, MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "../lib/auth";
import { hasDuplicateClinicTypeName, normalizeClinicTypeName } from "../lib/clinicTypes";
import { getSingleActiveFiscalYear } from "../lib/fiscalYear";

async function getCurrentFiscalYearForAdmin(ctx: QueryCtx | MutationCtx) {
  await requireAdmin(ctx);
  return await getSingleActiveFiscalYear(ctx);
}

export const getCurrentFiscalYearClinicTypes = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const fiscalYear = await getCurrentFiscalYearForAdmin(ctx);
    if (!fiscalYear) {
      return { fiscalYear: null, clinicTypes: [] };
    }

    const clinicTypes = await ctx.db
      .query("clinicTypes")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
      .collect();

    clinicTypes.sort((a, b) => a.name.localeCompare(b.name));

    return { fiscalYear, clinicTypes };
  },
});

export const createClinicType = mutation({
  args: {
    name: v.string(),
    cftePerHalfDay: v.number(),
  },
  returns: v.object({ message: v.string() }),
  handler: async (ctx, args) => {
    const fiscalYear = await getCurrentFiscalYearForAdmin(ctx);
    if (!fiscalYear) throw new Error("No active fiscal year available");

    const normalizedName = normalizeClinicTypeName(args.name);
    if (!normalizedName) throw new Error("Clinic type name is required");
    if (args.cftePerHalfDay <= 0) throw new Error("cFTE per half-day must be greater than 0");

    const existing = await ctx.db
      .query("clinicTypes")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
      .collect();

    if (hasDuplicateClinicTypeName(existing.map((item) => item.name), normalizedName)) {
      throw new Error("Clinic type already exists for this fiscal year");
    }

    await ctx.db.insert("clinicTypes", {
      fiscalYearId: fiscalYear._id,
      name: normalizedName,
      cftePerHalfDay: args.cftePerHalfDay,
      isActive: true,
    });

    return { message: "Clinic type created" };
  },
});

export const setClinicTypeActive = mutation({
  args: {
    clinicTypeId: v.id("clinicTypes"),
    isActive: v.boolean(),
  },
  returns: v.object({ message: v.string() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const clinicType = await ctx.db.get(args.clinicTypeId);
    if (!clinicType) throw new Error("Clinic type not found");

    await ctx.db.patch(clinicType._id, { isActive: args.isActive });
    return { message: args.isActive ? "Clinic type activated" : "Clinic type deactivated" };
  },
});
