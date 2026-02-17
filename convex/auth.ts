import { query } from "./_generated/server";

export const loggedInUser = query({
  args: {},
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
    if (!appUser) {
      return {
        workosUserId: identity.subject,
        email: identity.email ?? null,
        firstName: null,
        lastName: null,
        role: null,
        physicianId: null,
      };
    }

    return appUser;
  },
});
