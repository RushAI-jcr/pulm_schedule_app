import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type AuthUserDetails = {
  workosUserId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: "viewer" | "physician" | "admin";
  physicianId: string | null;
  lastLoginAt: number | null;
};

type PhysicianProfileDetails = {
  firstName: string;
  lastName: string;
  initials: string;
  email: string;
  isActive: boolean;
} | null;

function formatDate(timestamp: number | null): string {
  if (!timestamp) return "Unknown";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

export function AccountDetailsCard({
  user,
  profile,
}: {
  user: AuthUserDetails;
  profile: PhysicianProfileDetails;
}) {
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Not provided";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Details</CardTitle>
        <CardDescription>Identity and physician-link information for this signed-in account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Name</p>
            <p className="font-medium">{displayName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="font-medium">{user.email ?? "Unavailable"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Role</p>
            <div className="pt-1">
              <Badge variant="outline">{user.role}</Badge>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Last Login</p>
            <p className="font-medium">{formatDate(user.lastLoginAt)}</p>
          </div>
        </div>

        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground mb-1">Physician Link</p>
          {profile ? (
            <div className="space-y-1">
              <p className="font-medium">
                {profile.firstName} {profile.lastName} ({profile.initials})
              </p>
              <p className="text-xs text-muted-foreground">{profile.email}</p>
              <Badge variant={profile.isActive ? "default" : "secondary"}>
                {profile.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This account is not linked to a physician profile yet.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
