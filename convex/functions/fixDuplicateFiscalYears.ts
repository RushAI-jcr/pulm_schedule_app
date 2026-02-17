import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * One-time cleanup: archives all active fiscal years except the most recently
 * created "FY 2025-2026" (the one seeded from the real Excel calendar).
 * Delete this file after running.
 *
 * Run: npx convex run functions/fixDuplicateFiscalYears:archiveDuplicates
 */
export const archiveDuplicates = mutation({
  args: {},
  returns: v.object({ archived: v.number(), kept: v.string() }),
  handler: async (ctx) => {
    const allFiscalYears = await ctx.db.query("fiscalYears").collect();

    // Sort by creation time descending — keep the most recently created one
    const sorted = allFiscalYears.sort((a, b) => b._creationTime - a._creationTime);
    const keeper = sorted[0];

    let archived = 0;
    for (const fy of sorted.slice(1)) {
      const isActive = ["setup", "collecting", "building", "published"].includes(fy.status);
      if (isActive) {
        await ctx.db.patch(fy._id, { status: "archived" });
        archived++;
      }
    }

    return { archived, kept: `${keeper.label} (${keeper._id})` };
  },
});
