export type AppRole = "viewer" | "physician" | "admin";

const ROLE_RANK: Record<AppRole, number> = {
  viewer: 0,
  physician: 1,
  admin: 2,
};

export function normalizeAppRole(role: string | null | undefined): AppRole | null {
  if (typeof role !== "string") return null;
  const normalized = role.trim().toLowerCase();
  if (normalized === "viewer" || normalized === "physician" || normalized === "admin") {
    return normalized;
  }
  return null;
}

export function getHighestRole(roles: Array<AppRole | null | undefined>): AppRole | null {
  let highest: AppRole | null = null;
  for (const role of roles) {
    if (!role) continue;
    if (!highest || ROLE_RANK[role] > ROLE_RANK[highest]) {
      highest = role;
    }
  }
  return highest;
}

export function roleSatisfiesRequirement(role: AppRole, requiredRole: AppRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[requiredRole];
}

export function getIdentityRoleClaims(identity: Record<string, unknown>): Set<AppRole> {
  const claims = new Set<AppRole>();

  const push = (value: unknown) => {
    const normalized = normalizeAppRole(typeof value === "string" ? value : null);
    if (normalized) claims.add(normalized);
  };

  const pushArray = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const item of value) {
      push(item);
    }
  };

  push(identity.role);
  pushArray(identity.roles);
  pushArray(identity["https://workos.com/roles"]);
  push(identity["https://workos.com/role"]);

  return claims;
}

export function resolveEffectiveRole(args: {
  appRole: string | null | undefined;
  physicianRole: string | null | undefined;
  identityRoleClaims: Set<AppRole>;
  defaultRole?: AppRole;
}): AppRole {
  const {
    appRole,
    physicianRole,
    identityRoleClaims,
    defaultRole = "physician",
  } = args;

  const highest = getHighestRole([
    normalizeAppRole(appRole),
    normalizeAppRole(physicianRole),
    ...identityRoleClaims,
  ]);

  return highest ?? defaultRole;
}
