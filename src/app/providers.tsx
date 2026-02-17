"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";

function getConvexUrl() {
  return process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
}

export function Providers({ children }: { children: ReactNode }) {
  const convexUrl = getConvexUrl();
  const client = useMemo(
    () => (convexUrl ? new ConvexReactClient(convexUrl) : null),
    [convexUrl],
  );

  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-700 px-6 text-center">
        Missing `NEXT_PUBLIC_CONVEX_URL` in environment.
      </div>
    );
  }

  return <ConvexAuthProvider client={client}>{children}</ConvexAuthProvider>;
}
