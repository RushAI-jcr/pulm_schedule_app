"use client";

import { useState } from "react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";

export function SignOutButton() {
  const { user, signOut } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  if (!user) {
    return null;
  }

  return (
    <button
      className="px-4 py-2 rounded bg-white dark:bg-slate-800 text-secondary dark:text-slate-100 border border-gray-200 dark:border-slate-600 font-semibold hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-secondary-hover transition-colors shadow-sm hover:shadow disabled:opacity-60"
      disabled={submitting}
      onClick={async () => {
        setSubmitting(true);
        await signOut();
      }}
    >
      {submitting ? "Signing out..." : "Sign out"}
    </button>
  );
}
