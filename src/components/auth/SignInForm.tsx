"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { toast } from "sonner";

export function SignInForm() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const configuredConnection = process.env.NEXT_PUBLIC_WORKOS_CONNECTION?.trim();

  const handleWorkOsSignIn = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const domain = trimmedEmail.includes("@") ? trimmedEmail.split("@")[1] : "";

    if (!configuredConnection && !domain) {
      toast.error("Enter your institutional email to discover your SSO domain.");
      return;
    }

    setSubmitting(true);
    try {
      await signIn("workos", {
        redirectTo: "/",
        ...(configuredConnection ? { connection: configuredConnection } : { domain }),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign in with WorkOS");
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <form
        className="flex flex-col gap-form-field"
        onSubmit={(e) => {
          e.preventDefault();
          void handleWorkOsSignIn();
        }}
      >
        <input
          className="auth-input-field"
          type="email"
          name="workos_email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Institutional email"
          required
        />
        <button className="auth-button" type="submit" disabled={submitting}>
          {submitting ? "Redirecting..." : "Sign in with WorkOS"}
        </button>
        <p className="text-center text-sm text-secondary">
          Use your organization SSO account.
        </p>
      </form>
    </div>
  );
}
