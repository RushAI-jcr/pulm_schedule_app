import Link from "next/link";
import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { ThemeToggle } from "@/shared/components/theme/ThemeToggle";

export default async function HomePage() {
  const { user } = await withAuth();
  if (user) {
    redirect("/calendar");
  }

  return (
    <main className="relative min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center px-6 py-12">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-8 space-y-5">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold text-primary">Rush PCCM Calendar Assistant</h1>
          <p className="text-sm text-gray-600 dark:text-slate-300">
            Sign in with WorkOS to manage schedule requests and assignments.
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/sign-in"
            className="block w-full rounded-md bg-primary text-white text-center py-2.5 font-semibold hover:opacity-95 transition-opacity"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="block w-full rounded-md border border-gray-300 dark:border-slate-600 text-gray-800 dark:text-slate-100 text-center py-2.5 font-semibold hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
          >
            Create account
          </Link>
        </div>

        <div className="text-center">
          <Link href="/reset-password" className="text-sm text-secondary dark:text-slate-200 hover:underline">
            Forgot password?
          </Link>
        </div>
      </div>
    </main>
  );
}
