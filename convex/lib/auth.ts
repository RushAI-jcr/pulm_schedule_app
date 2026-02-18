import { Doc, Id } from "../_generated/dataModel";
import { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import { makeFunctionReference } from "convex/server";
import { AppRole, getIdentityRoleClaims, normalizeAppRole, resolveRoleForLinkState } from "./roles";
import { normalizeEmail, resolvePhysicianLink } from "./physicianLinking";

type AuthCtx = QueryCtx | MutationCtx;

export type AuthenticatedUser = {
  workosUserId: string;
  email: string | null;
  appUser: Doc<"users"> | null;
  physician: Doc<"physicians"> | null;
  role: AppRole;
};

export type AdminAccess = {
  role: "admin";
  workosUserId: string;
  appUser: Doc<"users"> | null;
  physician: Doc<"physicians"> | null;
  actorId: string;
  actorPhysicianId: Id<"physicians"> | null;
};

async function getAppUserByWorkosSubject(
  ctx: AuthCtx,
  workosUserId: string,
): Promise<Doc<"users"> | null> {
  const rows = await ctx.db
    .query("users")
    .withIndex("by_workosUserId", (q) => q.eq("workosUserId", workosUserId))
    .collect();

  if (rows.length > 1) {
    throw new Error("Data integrity error: duplicate app users for WorkOS subject");
  }
  return rows[0] ?? null;
}

export async function requireAuthenticatedUser(ctx: AuthCtx): Promise<AuthenticatedUser> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const email = normalizeEmail(identity.email);
  const [appUser, physicianLink] = await Promise.all([
    getAppUserByWorkosSubject(ctx, identity.subject),
    resolvePhysicianLink({
      ctx,
      identity: {
        subject: identity.subject,
        email: identity.email ?? null,
        givenName: identity.givenName ?? null,
        familyName: identity.familyName ?? null,
      },
    }),
  ]);
  const physician = physicianLink.physician;

  const role = resolveRoleForLinkState({
    appRole: appUser?.role,
    physicianRole: physician?.role,
    identityRoleClaims: getIdentityRoleClaims(identity as Record<string, unknown>),
    hasPhysicianLink: !!physician,
    defaultRole: "viewer",
  });

  return {
    workosUserId: identity.subject,
    email,
    appUser,
    physician,
    role,
  };
}

export async function getCurrentPhysician(ctx: AuthCtx) {
  const currentUser = await requireAuthenticatedUser(ctx);
  if (!currentUser.physician) {
    throw new Error("Signed-in account is not linked to a physician profile");
  }
  return currentUser.physician;
}

export async function requireAdmin(ctx: AuthCtx): Promise<AdminAccess> {
  const currentUser = await requireAuthenticatedUser(ctx);
  if (currentUser.role !== "admin") throw new Error("Admin access required");

  return {
    role: "admin",
    workosUserId: currentUser.workosUserId,
    appUser: currentUser.appUser,
    physician: currentUser.physician,
    actorId: currentUser.physician
      ? String(currentUser.physician._id)
      : (currentUser.appUser?.workosUserId ?? currentUser.workosUserId),
    actorPhysicianId: currentUser.physician?._id ?? null,
  };
}

// ---------------------------------------------------------------
// Action-compatible auth guard
// Actions don't have ctx.db, so they resolve roles via runQuery.
// ---------------------------------------------------------------

const loggedInUserRef = makeFunctionReference<"query">("auth:loggedInUser");

type ActionUserProfile = {
  role: string;
  physicianId: string | null;
};

export async function requireAdminAction(ctx: ActionCtx): Promise<{ role: "admin"; physicianId: string | null }> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const userProfile = (await ctx.runQuery(loggedInUserRef, {})) as ActionUserProfile | null;
  if (!userProfile || normalizeAppRole(userProfile.role) !== "admin") {
    throw new Error("Admin access required");
  }

  return { role: "admin", physicianId: userProfile.physicianId };
}
