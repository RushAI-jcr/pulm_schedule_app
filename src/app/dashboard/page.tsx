"use client";

import { Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex";
import { SignInForm } from "@/components/auth/SignInForm";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { toast, Toaster } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { Availability, AvailabilityOption } from "@/types";
import { availabilityOptions, defaultClinicTypeNames } from "@/constants";

export default function Dashboard() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm h-16 flex justify-between items-center border-b shadow-sm px-4">
        <h2 className="text-xl font-semibold text-primary">Physician Scheduling</h2>
        <Authenticated>
          <SignOutButton />
        </Authenticated>
      </header>
      <main className="flex-1 flex items-start justify-center p-8">
        <div className="w-full max-w-6xl mx-auto">
          <Content />
        </div>
      </main>
      <Toaster />
    </div>
  );
}

function Content() {
  const loggedInUser = useQuery(api.auth.loggedInUser);

  if (loggedInUser === undefined) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Authenticated>
        <DashboardContent user={loggedInUser} />
      </Authenticated>
      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>
    </div>
  );
}

function DashboardContent({ user }: { user: any }) {
  // Rest of the dashboard content will go here
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-4">Welcome, {user.name || user.email}</h1>
        <p className="text-gray-600">Physician Clinical Scheduling Dashboard</p>
      </div>
    </div>
  );
}
