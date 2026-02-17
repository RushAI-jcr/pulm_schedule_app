import { QueryCtx, MutationCtx } from "../_generated/server";

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

export async function getCurrentPhysician(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  // Convex Auth subject for this authenticated user.
  const byUserId = await ctx.db
    .query("physicians")
    .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
    .collect();

  if (byUserId.length > 1) {
    throw new Error("Data integrity error: duplicate physician linkage for current user");
  }
  if (byUserId.length === 1) {
    if (!byUserId[0].isActive) throw new Error("Physician record is inactive");
    return byUserId[0];
  }

  const email = normalizeEmail(identity.email);
  if (!email) {
    throw new Error("Signed-in account is not linked to a physician profile");
  }

  const byEmail = await ctx.db
    .query("physicians")
    .withIndex("by_email", (q) => q.eq("email", email))
    .collect();

  if (byEmail.length > 1) {
    throw new Error("Data integrity error: duplicate physician records for email");
  }
  if (byEmail.length === 0) throw new Error("Physician record not found");
  if (!byEmail[0].isActive) throw new Error("Physician record is inactive");
  return byEmail[0];
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const physician = await getCurrentPhysician(ctx);
  if (physician.role !== "admin") throw new Error("Admin access required");
  return physician;
}
