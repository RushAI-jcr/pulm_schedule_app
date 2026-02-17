import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import WorkOS from "@auth/core/providers/workos";
import { query } from "./_generated/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    WorkOS({
      issuer: process.env.AUTH_WORKOS_ISSUER ?? "https://api.workos.com/",
      ...(process.env.AUTH_WORKOS_CONNECTION
        ? { connection: process.env.AUTH_WORKOS_CONNECTION }
        : {}),
    }),
  ],
});

export const loggedInUser = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    const user = await ctx.db.get("users", userId);
    if (!user) {
      return null;
    }
    return user;
  },
});
