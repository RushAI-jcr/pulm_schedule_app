import { query } from "./_generated/server";
import { v } from "convex/values";
import { getIdentityRoleClaims, normalizeAppRole, resolveEffectiveRole } from "./lib/roles";

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

export const loggedInUser = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      workosUserId: v.string(),
      email: v.union(v.string(), v.null()),
      firstName: v.union(v.string(), v.null()),
      lastName: v.union(v.string(), v.null()),
      role: v.union(v.literal("viewer"), v.literal("physician"), v.literal("admin")),
      physicianId: v.union(v.id("physicians"), v.null()),
      lastLoginAt: v.union(v.number(), v.null()),
    })
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const users = await ctx.db
      .query("users")
      .withIndex("by_workosUserId", (q) => q.eq("workosUserId", identity.subject))
      .collect();

    if (users.length > 1) {
      throw new Error("Data integrity error: duplicate app users for WorkOS subject");
    }

    const appUser = users[0] ?? null;
    if (appUser && !normalizeAppRole(appUser.role)) {
      throw new Error("Data integrity error: existing app user has unsupported role");
    }

    const byUserId = await ctx.db
      .query("physicians")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .collect();

    if (byUserId.length > 1) {
      throw new Error("Data integrity error: duplicate physician linkage for current user");
    }

    let physician: (typeof byUserId)[number] | null = byUserId[0] ?? null;

    if (!physician) {
      const email = normalizeEmail(identity.email);
      if (email) {
        const byEmail = await ctx.db
          .query("physicians")
          .withIndex("by_email", (q) => q.eq("email", email))
          .collect();
        if (byEmail.length > 1) {
          throw new Error("Data integrity error: duplicate physician records for email");
        }
        physician = byEmail[0] ?? null;
      }
    }

    if (physician && !physician.isActive) {
      physician = null;
    }

    const role = resolveEffectiveRole({
      appRole: appUser?.role,
      physicianRole: physician?.role,
      identityRoleClaims: getIdentityRoleClaims(identity as Record<string, unknown>),
      defaultRole: "physician",
    });

    return {
      workosUserId: identity.subject,
      email: appUser?.email ?? normalizeEmail(identity.email),
      firstName: appUser?.firstName ?? identity.givenName ?? null,
      lastName: appUser?.lastName ?? identity.familyName ?? null,
      role,
      physicianId: physician?._id ?? appUser?.physicianId ?? null,
      lastLoginAt: appUser?.lastLoginAt ?? null,
    };
  },
});
