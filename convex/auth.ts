import { query } from "./_generated/server";
import { v } from "convex/values";
import { getIdentityRoleClaims, normalizeAppRole, resolveRoleForLinkState } from "./lib/roles";
import { normalizeEmail, resolvePhysicianLink } from "./lib/physicianLinking";

// Exception: Auth queries intentionally don't call requireAuthenticatedUser()
// to allow reporting auth state (logged in vs logged out) to middleware and UI
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

    const appUser = await ctx.db
      .query("users")
      .withIndex("by_workosUserId", (q) => q.eq("workosUserId", identity.subject))
      .unique();
    if (appUser && !normalizeAppRole(appUser.role)) {
      throw new Error("Data integrity error: existing app user has unsupported role");
    }

    const linkResolution = await resolvePhysicianLink({
      ctx,
      identity: {
        subject: identity.subject,
        email: identity.email ?? null,
        givenName: identity.givenName ?? null,
        familyName: identity.familyName ?? null,
      },
    });
    const physician = linkResolution.physician;

    const role = resolveRoleForLinkState({
      appRole: appUser?.role,
      physicianRole: physician?.role,
      identityRoleClaims: getIdentityRoleClaims(identity as Record<string, unknown>),
      hasPhysicianLink: !!physician,
      defaultRole: "viewer",
    });

    return {
      workosUserId: identity.subject,
      email: appUser?.email ?? normalizeEmail(identity.email),
      firstName: appUser?.firstName ?? identity.givenName ?? null,
      lastName: appUser?.lastName ?? identity.familyName ?? null,
      role,
      physicianId: physician?._id ?? null,
      lastLoginAt: appUser?.lastLoginAt ?? null,
    };
  },
});
