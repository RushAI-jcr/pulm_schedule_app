import { Doc, Id } from "../_generated/dataModel";
import { QueryCtx, MutationCtx } from "../_generated/server";
import { AppRole, getIdentityRoleClaims, resolveEffectiveRole } from "./roles";

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

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

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

async function getLinkedPhysician(args: {
  ctx: AuthCtx;
  workosUserId: string;
  email: string | null;
}): Promise<Doc<"physicians"> | null> {
  const { ctx, workosUserId, email } = args;

  const byUserId = await ctx.db
    .query("physicians")
    .withIndex("by_userId", (q) => q.eq("userId", workosUserId))
    .collect();

  if (byUserId.length > 1) {
    throw new Error("Data integrity error: duplicate physician linkage for current user");
  }
  if (byUserId.length === 1) {
    if (!byUserId[0].isActive) throw new Error("Physician record is inactive");
    return byUserId[0];
  }

  if (!email) return null;

  const byEmail = await ctx.db
    .query("physicians")
    .withIndex("by_email", (q) => q.eq("email", email))
    .collect();

  if (byEmail.length > 1) {
    throw new Error("Data integrity error: duplicate physician records for email");
  }
  if (byEmail.length === 0) return null;
  if (!byEmail[0].isActive) throw new Error("Physician record is inactive");
  return byEmail[0];
}

export async function requireAuthenticatedUser(ctx: AuthCtx): Promise<AuthenticatedUser> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const email = normalizeEmail(identity.email);
  const [appUser, physician] = await Promise.all([
    getAppUserByWorkosSubject(ctx, identity.subject),
    getLinkedPhysician({ ctx, workosUserId: identity.subject, email }),
  ]);

  const role = resolveEffectiveRole({
    appRole: appUser?.role,
    physicianRole: physician?.role,
    identityRoleClaims: getIdentityRoleClaims(identity as Record<string, unknown>),
    defaultRole: "physician",
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
