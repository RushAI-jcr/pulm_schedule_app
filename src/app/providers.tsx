"use client";

import { ReactNode, useCallback, useMemo } from "react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { AuthKitProvider, useAccessToken, useAuth } from "@workos-inc/authkit-nextjs/components";
import type { NoUserInfo, UserInfo } from "@workos-inc/authkit-nextjs";

type InitialAuth = Omit<UserInfo | NoUserInfo, "accessToken">;

function getConvexUrl() {
  return process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
}

export function Providers({
  children,
  initialAuth,
}: {
  children: ReactNode;
  initialAuth?: InitialAuth;
}) {
  const convexUrl = getConvexUrl();
  const client = useMemo(
    () => (convexUrl ? new ConvexReactClient(convexUrl) : null),
    [convexUrl],
  );

  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 text-gray-700 dark:text-slate-200 px-6 text-center">
        Missing `NEXT_PUBLIC_CONVEX_URL` in environment.
      </div>
    );
  }

  return (
    <AuthKitProvider initialAuth={initialAuth}>
      <ConvexProviderWithAuth client={client} useAuth={useAuthFromAuthKit}>
        {children}
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  );
}

function useAuthFromAuthKit() {
  const { user, loading } = useAuth();
  const { getAccessToken, refresh } = useAccessToken();

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken?: boolean } = {}): Promise<string | null> => {
      if (!user) {
        return null;
      }

      try {
        if (forceRefreshToken) {
          return (await refresh()) ?? null;
        }

        return (await getAccessToken()) ?? null;
      } catch (error) {
        console.error("Failed to get WorkOS access token", error);
        return null;
      }
    },
    [getAccessToken, refresh, user],
  );

  return {
    isLoading: loading,
    isAuthenticated: !!user,
    fetchAccessToken,
  };
}
