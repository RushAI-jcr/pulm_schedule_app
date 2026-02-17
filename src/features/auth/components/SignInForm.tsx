"use client";

import Link from "next/link";

export function SignInForm() {
  return (
    <div className="w-full space-y-3">
      <Link
        href="/sign-in"
        className="block w-full rounded-md bg-primary text-white text-center py-2.5 font-semibold hover:opacity-95 transition-opacity"
      >
        Sign in with WorkOS
      </Link>
      <Link
        href="/sign-up"
        className="block w-full rounded-md border border-gray-300 dark:border-slate-600 text-gray-800 dark:text-slate-100 text-center py-2.5 font-semibold hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
      >
        Create account
      </Link>
      <p className="text-center text-sm text-secondary dark:text-slate-200">
        Use your institutional account. Password reset is available from the hosted sign-in screen.
      </p>
    </div>
  );
}
