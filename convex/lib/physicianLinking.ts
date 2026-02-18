import { Doc } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";

type AuthCtx = QueryCtx | MutationCtx;

type IdentityLike = {
  subject: string;
  email?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  emailVerified?: boolean | null;
};

export type PhysicianLinkSource = "user_id" | "alias_email" | "canonical_email" | "auto_name_link";

export type PhysicianUnlinkedReason =
  | "no_match"
  | "no_email"
  | "inactive_physician"
  | "name_not_verified"
  | "email_domain_not_allowed"
  | "missing_name"
  | "ambiguous_name_match"
  | "already_linked_to_other_user";

export type PhysicianLinkResolution =
  | {
      physician: Doc<"physicians">;
      source: PhysicianLinkSource;
      unlinkedReason: null;
      didAutoLink: boolean;
    }
  | {
      physician: null;
      source: null;
      unlinkedReason: PhysicianUnlinkedReason;
      didAutoLink: false;
    };

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeComparableName(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function getEmailDomain(email: string): string | null {
  const atIndex = email.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === email.length - 1) return null;
  return email.slice(atIndex + 1).trim().toLowerCase();
}

export function isAutoNameLinkDomainAllowed(
  email: string,
  allowlistConfig = process.env.PHYSICIAN_NAME_AUTOLINK_ALLOWED_DOMAINS,
): boolean {
  const domain = getEmailDomain(email);
  if (!domain) return false;

  const parsedAllowlist = (allowlistConfig ?? "rush.edu")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  if (parsedAllowlist.includes("*")) return true;

  return parsedAllowlist.includes(domain);
}

export function isPhysicianNameAutoLinkEnabled(
  configValue = process.env.ENABLE_PHYSICIAN_NAME_AUTOLINK,
): boolean {
  if (!configValue) return false;
  return configValue.trim().toLowerCase() === "true";
}

function resolveIdentityFirstName(identity: IdentityLike, explicitFirstName?: string | null): string | null {
  return normalizeComparableName(
    explicitFirstName ?? identity.givenName ?? identity.firstName ?? null,
  );
}

function resolveIdentityLastName(identity: IdentityLike, explicitLastName?: string | null): string | null {
  return normalizeComparableName(
    explicitLastName ?? identity.familyName ?? identity.lastName ?? null,
  );
}

function resolveIdentityEmailVerified(identity: IdentityLike, explicitValue?: boolean): boolean {
  if (typeof explicitValue === "boolean") return explicitValue;
  return identity.emailVerified === true;
}

function buildInactiveResult(): PhysicianLinkResolution {
  return {
    physician: null,
    source: null,
    unlinkedReason: "inactive_physician",
    didAutoLink: false,
  };
}

async function resolveByUserId(
  ctx: AuthCtx,
  workosUserId: string,
): Promise<PhysicianLinkResolution | null> {
  const matches = await ctx.db
    .query("physicians")
    .withIndex("by_userId", (q) => q.eq("userId", workosUserId))
    .collect();

  if (matches.length > 1) {
    throw new Error("Data integrity error: duplicate physician linkage for current user");
  }
  if (matches.length === 0) return null;
  if (!matches[0].isActive) return buildInactiveResult();

  return {
    physician: matches[0],
    source: "user_id",
    unlinkedReason: null,
    didAutoLink: false,
  };
}

async function resolveByAliasEmail(
  ctx: AuthCtx,
  email: string,
): Promise<PhysicianLinkResolution | null> {
  const aliases = await ctx.db
    .query("physicianEmailAliases")
    .withIndex("by_email", (q) => q.eq("email", email))
    .collect();

  if (aliases.length > 1) {
    throw new Error("Data integrity error: duplicate physician email aliases");
  }
  if (aliases.length === 0) return null;

  const alias = aliases[0];
  const physician = await ctx.db.get(alias.physicianId);
  if (!physician) {
    throw new Error("Data integrity error: physician email alias references missing physician");
  }
  if (!physician.isActive) return buildInactiveResult();

  return {
    physician,
    source: "alias_email",
    unlinkedReason: null,
    didAutoLink: false,
  };
}

async function resolveByCanonicalEmail(
  ctx: AuthCtx,
  email: string,
): Promise<PhysicianLinkResolution | null> {
  const matches = await ctx.db
    .query("physicians")
    .withIndex("by_email", (q) => q.eq("email", email))
    .collect();

  if (matches.length > 1) {
    throw new Error("Data integrity error: duplicate physician records for email");
  }
  if (matches.length === 0) return null;
  if (!matches[0].isActive) return buildInactiveResult();

  return {
    physician: matches[0],
    source: "canonical_email",
    unlinkedReason: null,
    didAutoLink: false,
  };
}

async function ensureEmailAlias(args: {
  ctx: MutationCtx;
  physicianId: Doc<"physicians">["_id"];
  email: string;
  source: "admin" | "auto_name_link" | "self_email_link" | "backfill";
  createdByWorkosUserId?: string;
  isVerified: boolean;
}): Promise<void> {
  const existing = await args.ctx.db
    .query("physicianEmailAliases")
    .withIndex("by_email", (q) => q.eq("email", args.email))
    .collect();

  if (existing.length > 1) {
    throw new Error("Data integrity error: duplicate physician email aliases");
  }

  if (existing.length === 1) {
    if (existing[0].physicianId !== args.physicianId) {
      throw new Error("Email alias already linked to another physician");
    }
    if (!existing[0].isVerified && args.isVerified) {
      await args.ctx.db.patch(existing[0]._id, { isVerified: true });
    }
    return;
  }

  await args.ctx.db.insert("physicianEmailAliases", {
    physicianId: args.physicianId,
    email: args.email,
    isVerified: args.isVerified,
    source: args.source,
    createdAt: Date.now(),
    ...(args.createdByWorkosUserId
      ? { createdByWorkosUserId: args.createdByWorkosUserId }
      : {}),
  });
}

export async function resolvePhysicianLink(args: {
  ctx: AuthCtx;
  identity: IdentityLike;
}): Promise<PhysicianLinkResolution> {
  const { ctx, identity } = args;
  const email = normalizeEmail(identity.email);

  const byUserId = await resolveByUserId(ctx, identity.subject);
  if (byUserId) return byUserId;

  if (email) {
    const byAlias = await resolveByAliasEmail(ctx, email);
    if (byAlias) return byAlias;

    const byCanonicalEmail = await resolveByCanonicalEmail(ctx, email);
    if (byCanonicalEmail) return byCanonicalEmail;
  }

  return {
    physician: null,
    source: null,
    unlinkedReason: email ? "no_match" : "no_email",
    didAutoLink: false,
  };
}

export async function resolvePhysicianLinkWithAutoNameLink(args: {
  ctx: MutationCtx;
  identity: IdentityLike;
  firstName?: string;
  lastName?: string;
  emailVerified?: boolean;
}): Promise<PhysicianLinkResolution> {
  const { ctx, identity, firstName, lastName, emailVerified } = args;

  const baseResolution = await resolvePhysicianLink({ ctx, identity });
  if (baseResolution.physician || baseResolution.unlinkedReason === "inactive_physician") {
    return baseResolution;
  }

  if (!isPhysicianNameAutoLinkEnabled()) {
    return baseResolution;
  }

  const normalizedEmail = normalizeEmail(identity.email);
  if (!normalizedEmail) {
    return {
      physician: null,
      source: null,
      unlinkedReason: "no_email",
      didAutoLink: false,
    };
  }

  if (!resolveIdentityEmailVerified(identity, emailVerified)) {
    return {
      physician: null,
      source: null,
      unlinkedReason: "name_not_verified",
      didAutoLink: false,
    };
  }
  if (!isAutoNameLinkDomainAllowed(normalizedEmail)) {
    return {
      physician: null,
      source: null,
      unlinkedReason: "email_domain_not_allowed",
      didAutoLink: false,
    };
  }

  const normalizedFirstName = resolveIdentityFirstName(identity, firstName);
  const normalizedLastName = resolveIdentityLastName(identity, lastName);
  if (!normalizedFirstName || !normalizedLastName) {
    return {
      physician: null,
      source: null,
      unlinkedReason: "missing_name",
      didAutoLink: false,
    };
  }

  const activePhysicians = await ctx.db
    .query("physicians")
    .withIndex("by_isActive", (q) => q.eq("isActive", true))
    .collect();

  const matches = activePhysicians.filter((physician) => {
    const physicianFirstName = normalizeComparableName(physician.firstName);
    const physicianLastName = normalizeComparableName(physician.lastName);
    return physicianFirstName === normalizedFirstName && physicianLastName === normalizedLastName;
  });

  if (matches.length === 0) {
    return {
      physician: null,
      source: null,
      unlinkedReason: "no_match",
      didAutoLink: false,
    };
  }
  if (matches.length > 1) {
    return {
      physician: null,
      source: null,
      unlinkedReason: "ambiguous_name_match",
      didAutoLink: false,
    };
  }

  const matchedPhysician = matches[0];
  if (matchedPhysician.userId && matchedPhysician.userId !== identity.subject) {
    return {
      physician: null,
      source: null,
      unlinkedReason: "already_linked_to_other_user",
      didAutoLink: false,
    };
  }

  if (!matchedPhysician.userId) {
    await ctx.db.patch(matchedPhysician._id, { userId: identity.subject });
  }
  await ensureEmailAlias({
    ctx,
    physicianId: matchedPhysician._id,
    email: normalizedEmail,
    source: "auto_name_link",
    createdByWorkosUserId: identity.subject,
    isVerified: true,
  });

  return {
    physician: {
      ...matchedPhysician,
      userId: identity.subject,
    },
    source: "auto_name_link",
    unlinkedReason: null,
    didAutoLink: true,
  };
}

export async function ensurePhysicianAlias(args: {
  ctx: MutationCtx;
  physicianId: Doc<"physicians">["_id"];
  email: string;
  source: "admin" | "auto_name_link" | "self_email_link" | "backfill";
  createdByWorkosUserId?: string;
  isVerified: boolean;
}): Promise<void> {
  await ensureEmailAlias(args);
}
