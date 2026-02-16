import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentPhysician, requireAdmin } from "../lib/auth";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const getPhysicianCount = query({
  args: {},
  handler: async (ctx) => {
    return (await ctx.db.query("physicians").collect()).length;
  },
});

export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const byUserId = await ctx.db
      .query("physicians")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .unique();

    if (byUserId) return byUserId;

    const email = identity.email;
    if (!email) return null;

    return await ctx.db
      .query("physicians")
      .withIndex("by_email", (q) => q.eq("email", normalizeEmail(email)))
      .unique();
  },
});

export const linkCurrentUserToPhysicianByEmail = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    if (!identity.email) {
      throw new Error("Signed-in account must have an email");
    }

    const email = normalizeEmail(identity.email);
    const physician = await ctx.db
      .query("physicians")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (!physician) throw new Error("No physician record matches this email");
    if (physician.userId && physician.userId !== identity.subject) {
      throw new Error("Physician record already linked to another account");
    }

    if (physician.userId !== identity.subject) {
      await ctx.db.patch(physician._id, { userId: identity.subject });
    }

    return { message: "Physician account linked" };
  },
});

export const getPhysicians = query({
  args: {},
  handler: async (ctx) => {
    await getCurrentPhysician(ctx);
    return await ctx.db.query("physicians").collect();
  },
});

export const getPhysiciansByRole = query({
  args: { role: v.union(v.literal("physician"), v.literal("admin")) },
  handler: async (ctx, args) => {
    await getCurrentPhysician(ctx);
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
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    return await ctx.db.insert("physicians", {
      ...args,
      email: normalizeEmail(args.email),
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
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const { physicianId, ...updates } = args;
    await ctx.db.patch(physicianId, {
      ...updates,
      ...(updates.email ? { email: normalizeEmail(updates.email) } : {}),
    });
  },
});

export const seedPhysicians = mutation({
  args: {},
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
      { initials: "AK", firstName: "Akshay", lastName: "Kohli", email: "akohli@rush.edu", role: "physician" as const },
      { initials: "AG", firstName: "Amie", lastName: "Gamino", email: "agamino@rush.edu", role: "physician" as const },
      { initials: "AT", firstName: "Abhaya", lastName: "Trivedi", email: "atrivedi@rush.edu", role: "physician" as const },
      { initials: "BM", firstName: "Babak", lastName: "Mokhlesi", email: "bmokhlesi@rush.edu", role: "physician" as const },
      { initials: "BS", firstName: "Brian", lastName: "Stein", email: "bstein@rush.edu", role: "physician" as const },
      { initials: "DPG", firstName: "David", lastName: "Gurka", email: "dgurka@rush.edu", role: "physician" as const },
      { initials: "EC", firstName: "Elaine", lastName: "Chen", email: "echen@rush.edu", role: "physician" as const },
      { initials: "EP", firstName: "Ed", lastName: "Pickering", email: "epickering@rush.edu", role: "physician" as const },
      { initials: "JCR", firstName: "JC", lastName: "Rojas", email: "jcrojas@rush.edu", role: "admin" as const },
      { initials: "JEK", firstName: "Jessica", lastName: "Kuppy", email: "jkuppy@rush.edu", role: "physician" as const },
      { initials: "JG", firstName: "Jared", lastName: "Greenberg", email: "jgreenberg@rush.edu", role: "physician" as const },
      { initials: "JK", firstName: "James", lastName: "Katsis", email: "jkatsis@rush.edu", role: "physician" as const },
      { initials: "JN", firstName: "Julie", lastName: "Neborak", email: "jneborak@rush.edu", role: "physician" as const },
      { initials: "JR", firstName: "James", lastName: "Rowley", email: "jrowley@rush.edu", role: "physician" as const },
      { initials: "KB", firstName: "Kevin", lastName: "Buell", email: "kbuell@rush.edu", role: "physician" as const },
      { initials: "KJ", firstName: "Kari", lastName: "Jackson", email: "kjackson@rush.edu", role: "physician" as const },
      { initials: "KS", firstName: "Kalli", lastName: "Sarigianni", email: "ksarigianni@rush.edu", role: "physician" as const },
      { initials: "MS", firstName: "Meghan", lastName: "Snuckel", email: "msnuckel@rush.edu", role: "physician" as const },
      { initials: "MT", firstName: "Mark", lastName: "Tancredi", email: "mtancredi@rush.edu", role: "physician" as const },
      { initials: "MV", firstName: "Mona", lastName: "Vashi", email: "mvashi@rush.edu", role: "physician" as const },
      { initials: "MY", firstName: "Mark", lastName: "Yoder", email: "myoder@rush.edu", role: "physician" as const },
      { initials: "PN", firstName: "Prema", lastName: "Nanavaty", email: "pnanavaty@rush.edu", role: "physician" as const },
      { initials: "SF", firstName: "Sam", lastName: "Fox", email: "sfox@rush.edu", role: "physician" as const },
      { initials: "SP", firstName: "Shruti", lastName: "Patel", email: "spatel@rush.edu", role: "physician" as const },
      { initials: "WL", firstName: "Waj", lastName: "Lodhi", email: "wlodhi@rush.edu", role: "physician" as const },
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
