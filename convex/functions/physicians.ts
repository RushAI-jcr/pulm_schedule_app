import { query, mutation, MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireAuthenticatedUser } from "../lib/auth";
import { Id } from "../_generated/dataModel";
import {
  AppRole,
  getIdentityRoleClaims,
  normalizeAppRole,
  resolveEffectiveRole,
} from "../lib/roles";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeName(value: string): string {
  return value.trim();
}

function normalizeInitials(initials: string): string {
  return initials.trim().toUpperCase();
}

function normalizeOptionalName(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

async function upsertUserProfile(
  ctx: MutationCtx,
  args: {
    workosUserId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role: AppRole;
    physicianId?: Id<"physicians">;
  },
) {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_workosUserId", (q) => q.eq("workosUserId", args.workosUserId))
    .collect();

  if (existing.length > 1) {
    throw new Error("Data integrity error: duplicate app users for WorkOS subject");
  }

  const firstName = normalizeOptionalName(args.firstName);
  const lastName = normalizeOptionalName(args.lastName);

  const payload = {
    workosUserId: args.workosUserId,
    email: normalizeEmail(args.email),
    role: args.role,
    lastLoginAt: Date.now(),
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(args.physicianId ? { physicianId: args.physicianId } : {}),
  };

  if (existing.length === 0) {
    await ctx.db.insert("users", payload);
    return;
  }

  await ctx.db.patch(existing[0]._id, payload);
}

export const getPhysicianCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    return (await ctx.db.query("physicians").collect()).length;
  },
});

export const getMyProfile = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const byUserId = await ctx.db
      .query("physicians")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .collect();

    if (byUserId.length > 1) {
      throw new Error("Data integrity error: duplicate physician linkage for current user");
    }
    if (byUserId.length === 1) return byUserId[0];

    const email = identity.email;
    if (!email) return null;

    const byEmail = await ctx.db
      .query("physicians")
      .withIndex("by_email", (q) => q.eq("email", normalizeEmail(email)))
      .collect();

    if (byEmail.length > 1) {
      throw new Error("Data integrity error: duplicate physician records for email");
    }
    return byEmail[0] ?? null;
  },
});

export const linkCurrentUserToPhysicianByEmail = mutation({
  args: {},
  returns: v.object({ message: v.string() }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    if (!identity.email) {
      throw new Error("Signed-in account must have an email");
    }
    const email = normalizeEmail(identity.email);

    const byUserId = await ctx.db
      .query("physicians")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .collect();
    if (byUserId.length > 1) {
      throw new Error("Data integrity error: duplicate physician linkage for current user");
    }
    if (byUserId.length === 1 && normalizeEmail(byUserId[0].email) !== email) {
      throw new Error("Signed-in account already linked to another physician");
    }

    const byEmail = await ctx.db
      .query("physicians")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();

    if (byEmail.length > 1) {
      throw new Error("Data integrity error: duplicate physician records for email");
    }
    const physician = byEmail[0];

    if (!physician) throw new Error("No physician record matches this email");
    if (physician.userId && physician.userId !== identity.subject) {
      throw new Error("Physician record already linked to another account");
    }
    if (!physician.isActive) {
      throw new Error("Physician record is inactive");
    }

    if (physician.userId !== identity.subject) {
      await ctx.db.patch(physician._id, { userId: identity.subject });
    }

    const existingUsers = await ctx.db
      .query("users")
      .withIndex("by_workosUserId", (q) => q.eq("workosUserId", identity.subject))
      .collect();
    if (existingUsers.length > 1) {
      throw new Error("Data integrity error: duplicate app users for WorkOS subject");
    }

    const existingUser = existingUsers[0] ?? null;
    if (existingUser && !normalizeAppRole(existingUser.role)) {
      throw new Error("Data integrity error: existing app user has unsupported role");
    }

    const role = resolveEffectiveRole({
      appRole: existingUser?.role,
      physicianRole: physician.role,
      identityRoleClaims: getIdentityRoleClaims(identity as Record<string, unknown>),
    });

    await upsertUserProfile(ctx, {
      workosUserId: identity.subject,
      email: physician.email,
      firstName: physician.firstName,
      lastName: physician.lastName,
      role,
      physicianId: physician._id,
    });

    return { message: "Physician account linked" };
  },
});

export const syncWorkosSessionUser = mutation({
  args: {
    workosUserId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    if (identity.subject !== args.workosUserId) {
      throw new Error("Authenticated subject does not match provided WorkOS user");
    }
    if (identity.email && normalizeEmail(identity.email) !== normalizeEmail(args.email)) {
      throw new Error("Authenticated email does not match provided WorkOS user");
    }

    const email = normalizeEmail(args.email);

    const [linkedPhysicians, existingUsers] = await Promise.all([
      ctx.db
        .query("physicians")
        .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
        .collect(),
      ctx.db
        .query("users")
        .withIndex("by_workosUserId", (q) => q.eq("workosUserId", identity.subject))
        .collect(),
    ]);

    if (existingUsers.length > 1) {
      throw new Error("Data integrity error: duplicate app users for WorkOS subject");
    }

    const existingUser = existingUsers[0] ?? null;
    if (
      existingUser &&
      identity.email &&
      normalizeEmail(existingUser.email) !== normalizeEmail(identity.email)
    ) {
      throw new Error("Authenticated email does not match existing app profile email");
    }

    if (existingUser && !normalizeAppRole(existingUser.role)) {
      throw new Error("Data integrity error: existing app user has unsupported role");
    }

    if (linkedPhysicians.length > 1) {
      throw new Error("Data integrity error: duplicate physician linkage for current user");
    }

    let physician = linkedPhysicians[0] ?? null;

    if (!physician) {
      const byEmail = await ctx.db
        .query("physicians")
        .withIndex("by_email", (q) => q.eq("email", email))
        .collect();

      if (byEmail.length > 1) {
        throw new Error("Data integrity error: duplicate physician records for email");
      }

      physician = byEmail[0] ?? null;
      if (physician) {
        if (physician.userId && physician.userId !== identity.subject) {
          throw new Error("Physician record already linked to another account");
        }
        if (!physician.isActive) {
          throw new Error("Physician record is inactive");
        }
        if (physician.userId !== identity.subject) {
          await ctx.db.patch(physician._id, { userId: identity.subject });
        }
      }
    }

    const role = resolveEffectiveRole({
      appRole: existingUser?.role,
      physicianRole: physician?.role,
      identityRoleClaims: getIdentityRoleClaims(identity as Record<string, unknown>),
    });

    await upsertUserProfile(ctx, {
      workosUserId: identity.subject,
      email,
      firstName: args.firstName ?? physician?.firstName,
      lastName: args.lastName ?? physician?.lastName,
      role,
      physicianId: physician?._id,
    });

    return {
      linkedPhysicianId: physician?._id ?? null,
      role,
    };
  },
});

export const getPhysicians = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    await requireAuthenticatedUser(ctx);
    const physicians = await ctx.db.query("physicians").collect();
    physicians.sort((a, b) => {
      const byLast = a.lastName.localeCompare(b.lastName);
      if (byLast !== 0) return byLast;
      return a.firstName.localeCompare(b.firstName);
    });
    return physicians;
  },
});

export const getPhysiciansByRole = query({
  args: { role: v.union(v.literal("physician"), v.literal("admin")) },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    return await ctx.db
      .query("physicians")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .collect();
  },
});

export const createPhysician = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    initials: v.string(),
    email: v.string(),
    role: v.union(v.literal("physician"), v.literal("admin")),
  },
  returns: v.id("physicians"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const firstName = normalizeName(args.firstName);
    const lastName = normalizeName(args.lastName);
    const initials = normalizeInitials(args.initials);
    const email = normalizeEmail(args.email);

    if (!firstName || !lastName || !initials || !email) {
      throw new Error("First name, last name, initials, and email are required");
    }

    const existingByEmail = await ctx.db
      .query("physicians")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    if (existingByEmail.length > 0) throw new Error("A physician with this email already exists");

    const existingByInitials = await ctx.db
      .query("physicians")
      .withIndex("by_initials", (q) => q.eq("initials", initials))
      .collect();
    if (existingByInitials.length > 0) throw new Error("A physician with these initials already exists");

    return await ctx.db.insert("physicians", {
      firstName,
      lastName,
      initials,
      email,
      role: args.role,
      isActive: true,
    });
  },
});

export const updatePhysician = mutation({
  args: {
    physicianId: v.id("physicians"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    initials: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.optional(v.union(v.literal("physician"), v.literal("admin"))),
    isActive: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const { physicianId, ...updates } = args;
    const existing = await ctx.db.get(physicianId);
    if (!existing) throw new Error("Physician not found");

    const normalizedInitials = updates.initials ? normalizeInitials(updates.initials) : undefined;
    const normalizedEmail = updates.email ? normalizeEmail(updates.email) : undefined;
    const normalizedFirstName = updates.firstName ? normalizeName(updates.firstName) : undefined;
    const normalizedLastName = updates.lastName ? normalizeName(updates.lastName) : undefined;

    if (normalizedEmail) {
      const byEmail = await ctx.db
        .query("physicians")
        .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
        .collect();
      if (byEmail.some((row) => row._id !== physicianId)) {
        throw new Error("A physician with this email already exists");
      }
    }

    if (normalizedInitials) {
      const byInitials = await ctx.db
        .query("physicians")
        .withIndex("by_initials", (q) => q.eq("initials", normalizedInitials))
        .collect();
      if (byInitials.some((row) => row._id !== physicianId)) {
        throw new Error("A physician with these initials already exists");
      }
    }

    await ctx.db.patch(physicianId, {
      ...updates,
      ...(normalizedFirstName ? { firstName: normalizedFirstName } : {}),
      ...(normalizedLastName ? { lastName: normalizedLastName } : {}),
      ...(normalizedInitials ? { initials: normalizedInitials } : {}),
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
    });
  },
});

export const seedPhysicians = mutation({
  args: {},
  returns: v.object({ message: v.string() }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Only seed if no physicians exist
    const existing = await ctx.db.query("physicians").first();
    if (existing) {
      await requireAdmin(ctx);
      return { message: "Physicians already seeded" };
    }

    const physicians = [
      { initials: "AK", firstName: "Akshay", lastName: "Kohli", email: "Akshay_Kohli@rush.edu", role: "physician" as const },
      { initials: "AG", firstName: "Amie", lastName: "Gamino", email: "Amie_Gamino@rush.edu", role: "physician" as const },
      { initials: "AT", firstName: "Abhaya", lastName: "Trivedi", email: "Abhaya_Trivedi@rush.edu", role: "physician" as const },
      { initials: "BM", firstName: "Babak", lastName: "Mokhlesi", email: "Babak_Mokhlesi@rush.edu", role: "admin" as const },
      { initials: "BS", firstName: "Brian", lastName: "Stein", email: "Brian_Stein@rush.edu", role: "physician" as const },
      { initials: "DPG", firstName: "David", lastName: "Gurka", email: "David_Gurka@rush.edu", role: "physician" as const },
      { initials: "EC", firstName: "Elaine", lastName: "Chen", email: "Elaine_Chen@rush.edu", role: "physician" as const },
      { initials: "EP", firstName: "Edward", lastName: "Pickering", email: "Edward_Pickering@rush.edu", role: "physician" as const },
      { initials: "JCR", firstName: "Juan", lastName: "Rojas", email: "Juan_Rojas@rush.edu", role: "admin" as const },
      { initials: "JEK", firstName: "Jessica", lastName: "Kuppy", email: "Jessica_E_Kuppy@rush.edu", role: "physician" as const },
      { initials: "JG", firstName: "Jared", lastName: "Greenberg", email: "Jared_Greenberg@rush.edu", role: "physician" as const },
      { initials: "JK", firstName: "James", lastName: "Katsis", email: "James_Katsis@rush.edu", role: "physician" as const },
      { initials: "JN", firstName: "Julie", lastName: "Neborak", email: "Julie_Neborak@rush.edu", role: "physician" as const },
      { initials: "JR", firstName: "James", lastName: "Rowley", email: "James_Rowley@rush.edu", role: "physician" as const },
      { initials: "KB", firstName: "Kevin", lastName: "Buell", email: "Kevin_Buell@rush.edu", role: "physician" as const },
      { initials: "KJ", firstName: "Kari", lastName: "Jackson", email: "Karen_Jackson@rush.edu", role: "physician" as const },
      { initials: "KS", firstName: "Kalli", lastName: "Sarigiannis", email: "Kalli_A_Sarigiannis@rush.edu", role: "physician" as const },
      { initials: "MS", firstName: "Meghan", lastName: "Snuckel", email: "Meghan_Snuckel@rush.edu", role: "physician" as const },
      { initials: "MT", firstName: "Mark", lastName: "Tancredi", email: "Mark_Tancredi@rush.edu", role: "physician" as const },
      { initials: "MV", firstName: "Mona", lastName: "Vashi", email: "Mona_Vashi@rush.edu", role: "physician" as const },
      { initials: "MY", firstName: "Mark", lastName: "Yoder", email: "Mark_A_Yoder@rush.edu", role: "admin" as const },
      { initials: "PN", firstName: "Prema", lastName: "Nanavaty", email: "Prema_Nanavaty@rush.edu", role: "physician" as const },
      { initials: "SF", firstName: "Sam", lastName: "Fox", email: "Samuel_C_Fox@rush.edu", role: "physician" as const },
      { initials: "SP", firstName: "Shruti", lastName: "Patel", email: "Shruti_Patel@rush.edu", role: "physician" as const },
      { initials: "WL", firstName: "Wajahat", lastName: "Lodhi", email: "Wajahat_A_Lodhi@rush.edu", role: "physician" as const },
    ];

    for (const physician of physicians) {
      await ctx.db.insert("physicians", {
        ...physician,
        email: normalizeEmail(physician.email),
        isActive: true,
      });
    }

    return { message: `Seeded ${physicians.length} physicians` };
  },
});

export const seedAdminRoles = mutation({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const adminInitials = ["MY", "BM", "JCR"];
    const results: Array<{ initials: string; status: "updated" | "unchanged" | "missing" }> = [];

    for (const initials of adminInitials) {
      const rows = await ctx.db
        .query("physicians")
        .withIndex("by_initials", (q) => q.eq("initials", initials))
        .collect();

      if (rows.length === 0) {
        results.push({ initials, status: "missing" });
        continue;
      }

      const physician = rows[0];
      const wasAdmin = physician.role === "admin";
      if (!wasAdmin) {
        await ctx.db.patch(physician._id, { role: "admin" });
      }

      if (physician.userId) {
        await upsertUserProfile(ctx, {
          workosUserId: physician.userId,
          email: physician.email,
          firstName: physician.firstName,
          lastName: physician.lastName,
          role: "admin",
          physicianId: physician._id,
        });
      }

      results.push({ initials, status: wasAdmin ? "unchanged" : "updated" });
    }

    return {
      message: "Admin role seed complete",
      results,
    };
  },
});
