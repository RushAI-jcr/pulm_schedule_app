import { Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster } from "sonner";
import { useEffect, useState } from "react";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm h-16 flex justify-between items-center border-b shadow-sm px-4">
        <h2 className="text-xl font-semibold text-primary">Physician Scheduling</h2>
        <Authenticated>
          <SignOutButton />
        </Authenticated>
      </header>
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-4xl mx-auto">
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
      <div className="flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-primary mb-4">Physician Clinical Scheduling</h1>
        <Authenticated>
          <p className="text-xl text-secondary">
            Welcome back, {loggedInUser?.email ?? "friend"}!
          </p>
        </Authenticated>
        <Unauthenticated>
          <p className="text-xl text-secondary">Sign in to get started</p>
        </Unauthenticated>
      </div>

      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>

      <Authenticated>
        <Dashboard />
      </Authenticated>
    </div>
  );
}

function Dashboard() {
  const myProfile = useQuery(api.functions.physicians.getMyProfile);
  const physicianCount = useQuery(api.functions.physicians.getPhysicianCount);
  const linkCurrentUser = useMutation(
    api.functions.physicians.linkCurrentUserToPhysicianByEmail,
  );

  useEffect(() => {
    if (myProfile && !myProfile.userId) {
      void linkCurrentUser({}).catch(() => undefined);
    }
  }, [linkCurrentUser, myProfile?._id, myProfile?.userId]);

  const physicians = useQuery(
    api.functions.physicians.getPhysicians,
    myProfile ? {} : "skip",
  );
  const fiscalYears = useQuery(
    api.functions.fiscalYears.getFiscalYears,
    myProfile ? {} : "skip",
  );
  const currentFY = useQuery(
    api.functions.fiscalYears.getCurrentFiscalYear,
    myProfile ? {} : "skip",
  );

  if (
    myProfile === undefined ||
    physicianCount === undefined ||
    physicians === undefined ||
    fiscalYears === undefined ||
    currentFY === undefined
  ) {
    return <div>Loading...</div>;
  }

  if (!myProfile) {
    if (physicianCount === 0) {
      return <BootstrapSetup />;
    }
    return <NoPhysicianProfile />;
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Physicians ({physicians.length})</h3>
          <div className="space-y-2">
            {physicians.slice(0, 5).map((physician) => (
              <div key={physician._id} className="flex justify-between">
                <span>{physician.initials}</span>
                <span className="text-sm text-gray-600">{physician.firstName} {physician.lastName}</span>
                <span className={`text-xs px-2 py-1 rounded ${
                  physician.role === 'admin' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                }`}>
                  {physician.role}
                </span>
              </div>
            ))}
            {physicians.length > 5 && (
              <div className="text-sm text-gray-500">... and {physicians.length - 5} more</div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Fiscal Years ({fiscalYears.length})</h3>
          <div className="space-y-2">
            {fiscalYears.map((fy) => (
              <div key={fy._id} className="flex justify-between">
                <span className="font-medium">{fy.label}</span>
                <span className={`text-xs px-2 py-1 rounded ${
                  fy.status === 'published' ? 'bg-green-100 text-green-800' :
                  fy.status === 'collecting' ? 'bg-yellow-100 text-yellow-800' :
                  fy.status === 'building' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {fy.status}
                </span>
              </div>
            ))}
          </div>
          {currentFY && (
            <div className="mt-3 pt-3 border-t text-sm text-gray-700">
              Current cycle: <span className="font-medium">{currentFY.label}</span> ({currentFY.status})
            </div>
          )}
        </div>
      </div>

      <AdminActions isAdmin={myProfile.role === "admin"} />
    </div>
  );
}

function NoPhysicianProfile() {
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-2">Profile Not Linked</h3>
      <p className="text-sm text-gray-700">
        This account is authenticated but not linked to a physician profile. Sign in with your
        institutional email that exists in the physician roster, or ask an admin to create/link your record.
      </p>
    </div>
  );
}

function BootstrapSetup() {
  return (
    <div className="bg-white p-6 rounded-lg shadow space-y-4">
      <h3 className="text-lg font-semibold">Initial Setup</h3>
      <p className="text-sm text-gray-700">
        No physicians exist yet. Seed the physician roster first, then sign in as the seeded admin account
        to continue setup.
      </p>
      <SeedButton
        mutation={api.functions.physicians.seedPhysicians}
        label="Seed Physicians"
        description="Add initial physician roster"
      />
    </div>
  );
}

function AdminActions({ isAdmin }: { isAdmin: boolean }) {
  if (!isAdmin) {
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-2">Admin Actions</h3>
        <p className="text-sm text-gray-700">You do not have admin permissions.</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">Admin Actions</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SeedButton 
          mutation={api.functions.physicians.seedPhysicians}
          label="Seed Physicians"
          description="Add 25 physicians to the database"
        />
        <SeedButton 
          mutation={api.functions.fiscalYears.seedFY27}
          label="Create FY27"
          description="Create FY27 with 52 weeks"
        />
      </div>
    </div>
  );
}

function SeedButton({ mutation, label, description }: {
  mutation: any,
  label: string, 
  description: string 
}) {
  const runMutation = useMutation(mutation);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  
  const handleClick = async () => {
    setIsLoading(true);
    try {
      const response = await runMutation({});
      if (response && typeof response === "object" && "message" in response) {
        setResult(String(response.message));
      } else {
        setResult("Done");
      }
    } catch (error) {
      setResult(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="border rounded-lg p-4">
      <h4 className="font-medium mb-2">{label}</h4>
      <p className="text-sm text-gray-600 mb-3">{description}</p>
      <button
        onClick={handleClick}
        disabled={isLoading}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {isLoading ? "Loading..." : label}
      </button>
      {result && (
        <p className="mt-2 text-sm text-gray-700">{result}</p>
      )}
    </div>
  );
}
