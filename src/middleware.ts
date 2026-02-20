import { NextRequest } from "next/server";
import { authkit, handleAuthkitHeaders } from "@workos-inc/authkit-nextjs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// ---------------------------------------------------------------------------
// Role helpers (inlined for Edge runtime compatibility — mirrors convex/lib/roles.ts)
// ---------------------------------------------------------------------------

type AppRole = "viewer" | "physician" | "admin";

const ROLE_RANK: Record<AppRole, number> = {
  viewer: 0,
  physician: 1,
  admin: 2,
};

function normalizeAppRole(role: string | null | undefined): AppRole | null {
  if (typeof role !== "string") return null;
  const normalized = role.trim().toLowerCase();
  if (normalized === "viewer" || normalized === "physician" || normalized === "admin") {
    return normalized;
  }
  return null;
}

function getHighestRole(roles: Array<AppRole | null | undefined>): AppRole | null {
  let highest: AppRole | null = null;
  for (const role of roles) {
    if (!role) continue;
    if (!highest || ROLE_RANK[role] > ROLE_RANK[highest]) {
      highest = role;
    }
  }
  return highest;
}

function roleSatisfiesRequirement(role: AppRole, requiredRole: AppRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[requiredRole];
}

// ---------------------------------------------------------------------------
// Route protection
// ---------------------------------------------------------------------------

const unauthenticatedPaths = ["/", "/sign-in", "/sign-up", "/callback", "/reset-password"];

const routeRoleRequirements: Array<{ prefix: string; role: AppRole }> = [
  { prefix: "/admin", role: "admin" },
  { prefix: "/preferences", role: "physician" },
  { prefix: "/trades", role: "physician" },
];

function isPathMatch(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isPublicPath(pathname: string) {
  return unauthenticatedPaths.some((prefix) => isPathMatch(pathname, prefix));
}

function resolveSessionRole(session: Awaited<ReturnType<typeof authkit>>["session"]): AppRole | null {
  if (!session.user) return null;

  const highest = getHighestRole([
    normalizeAppRole(session.role),
    ...(session.roles ?? []).map((role) => normalizeAppRole(role)),
  ]);

  // New authenticated signups default to viewer access until linked.
  return highest ?? "viewer";
}

let convexClient: ConvexHttpClient | null = null;

function getConvexClient(): ConvexHttpClient | null {
  if (convexClient) return convexClient;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return null;
  convexClient = new ConvexHttpClient(convexUrl);
  return convexClient;
}

async function getConvexRole(accessToken: string | undefined): Promise<AppRole | null> {
  if (!accessToken) return null;
  const client = getConvexClient();
  if (!client) return null;

  try {
    client.setAuth(accessToken);
    const user = await client.query(api.auth.loggedInUser, {});
    return normalizeAppRole(user?.role ?? null);
  } catch {
    return null;
  }
}

function getRequiredRole(pathname: string): AppRole | null {
  return (
    routeRoleRequirements
      .filter((entry) => isPathMatch(pathname, entry.prefix))
      .reduce<AppRole | null>((highest, entry) => {
        if (!highest) return entry.role;
        return roleSatisfiesRequirement(entry.role, highest) ? entry.role : highest;
      }, null)
  );
}

function buildPreviewAwareRedirectUri(request: NextRequest) {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_BRANCH_URL) {
    return `https://${process.env.VERCEL_BRANCH_URL}/callback`;
  }
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/callback`;
  }
  return new URL("/callback", request.url).toString();
}

export default async function middleware(request: NextRequest) {
  const { session, headers, authorizationUrl } = await authkit(request, {
    redirectUri: buildPreviewAwareRedirectUri(request),
  });

  const { pathname } = request.nextUrl;
  if (!isPublicPath(pathname) && !session.user && authorizationUrl) {
    return handleAuthkitHeaders(request, headers, { redirect: authorizationUrl });
  }

  const requiredRole = getRequiredRole(pathname);
  if (requiredRole && session.user) {
    const resolvedRole =
      (await getConvexRole(session.accessToken)) ??
      resolveSessionRole(session);

    if (!resolvedRole || !roleSatisfiesRequirement(resolvedRole, requiredRole)) {
      return handleAuthkitHeaders(request, headers, { redirect: "/calendar?forbidden=1" });
    }
  }

  return handleAuthkitHeaders(request, headers);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
