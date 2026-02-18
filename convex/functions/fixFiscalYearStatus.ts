import { mutation, MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "../lib/auth";
import { ensureCanActivateFiscalYear } from "../lib/fiscalYear";

export const fixFY2526Status = mutation({
  args: {},
  returns: v.object({ message: v.string() }),
  handler: async (ctx: MutationCtx) => {
    const admin = await requireAdmin(ctx);

    // Find FY2025-2026 by label
    const fy2526 = await ctx.db
      .query("fiscalYears")
      .withIndex("by_label", (q) => q.eq("label", "FY 2025-2026"))
      .first();

    if (!fy2526) {
      return { message: "FY 2025-2026 not found" };
    }

    if (fy2526.status !== "published") {
      await ensureCanActivateFiscalYear(ctx, fy2526._id);
    }

    // Update FY2025-2026 to published (active)
    await ctx.db.patch(fy2526._id, {
      status: "published"
    });

    return { message: "Updated FY 2025-2026 to published status" };
  },
});
