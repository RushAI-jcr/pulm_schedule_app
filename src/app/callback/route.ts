import { handleAuth } from "@workos-inc/authkit-nextjs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";

export const GET = handleAuth({
  onSuccess: async ({ user, accessToken }) => {
    if (!user.email) {
      return;
    }

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      console.warn("Skipping WorkOS session sync: NEXT_PUBLIC_CONVEX_URL is missing");
      return;
    }

    const convex = new ConvexHttpClient(convexUrl);
    convex.setAuth(accessToken);

    try {
      await convex.mutation(api.functions.physicians.syncWorkosSessionUser, {
        workosUserId: user.id,
        email: user.email,
        ...(user.firstName ? { firstName: user.firstName } : {}),
        ...(user.lastName ? { lastName: user.lastName } : {}),
        ...(typeof user.emailVerified === "boolean"
          ? { emailVerified: user.emailVerified }
          : {}),
      });
    } catch (error) {
      console.error("Failed to sync WorkOS session user with Convex", error);
    }
  },
  returnPathname: "/calendar",
});
