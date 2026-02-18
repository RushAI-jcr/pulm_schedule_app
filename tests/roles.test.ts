import { describe, expect, it } from "vitest";
import {
  getIdentityRoleClaims,
  resolveEffectiveRole,
  resolveRoleForLinkState,
  roleSatisfiesRequirement,
} from "../convex/lib/roles";

describe("role hierarchy helpers", () => {
  it("defaults authenticated users to viewer when no role source exists", () => {
    expect(
      resolveEffectiveRole({
        appRole: null,
        physicianRole: null,
        identityRoleClaims: new Set(),
      }),
    ).toBe("viewer");
  });

  it("keeps explicit viewer role for non-physician accounts", () => {
    expect(
      resolveEffectiveRole({
        appRole: "viewer",
        physicianRole: null,
        identityRoleClaims: new Set(),
      }),
    ).toBe("viewer");
  });

  it("uses highest role when sources conflict", () => {
    expect(
      resolveEffectiveRole({
        appRole: "viewer",
        physicianRole: "physician",
        identityRoleClaims: new Set(),
      }),
    ).toBe("physician");

    expect(
      resolveEffectiveRole({
        appRole: "viewer",
        physicianRole: "physician",
        identityRoleClaims: new Set(["admin"]),
      }),
    ).toBe("admin");
  });

  it("extracts supported role claims from identity payloads", () => {
    const claims = getIdentityRoleClaims({
      role: "admin",
      roles: ["viewer", "custom"],
      "https://workos.com/roles": ["physician"],
      "https://workos.com/role": "unsupported",
    });

    expect(Array.from(claims).sort()).toEqual(["admin", "physician", "viewer"]);
  });

  it("applies admin > physician > viewer requirements", () => {
    expect(roleSatisfiesRequirement("admin", "viewer")).toBe(true);
    expect(roleSatisfiesRequirement("physician", "viewer")).toBe(true);
    expect(roleSatisfiesRequirement("viewer", "physician")).toBe(false);
    expect(roleSatisfiesRequirement("physician", "admin")).toBe(false);
  });

  it("forces unlinked non-admin users to viewer", () => {
    expect(
      resolveRoleForLinkState({
        appRole: "physician",
        physicianRole: null,
        identityRoleClaims: new Set(),
        hasPhysicianLink: false,
      }),
    ).toBe("viewer");

    expect(
      resolveRoleForLinkState({
        appRole: null,
        physicianRole: null,
        identityRoleClaims: new Set(["physician"]),
        hasPhysicianLink: false,
      }),
    ).toBe("viewer");

    expect(
      resolveRoleForLinkState({
        appRole: "physician",
        physicianRole: "physician",
        identityRoleClaims: new Set(["viewer"]),
        hasPhysicianLink: false,
      }),
    ).toBe("viewer");
  });

  it("keeps admin role without physician link", () => {
    expect(
      resolveRoleForLinkState({
        appRole: "admin",
        physicianRole: null,
        identityRoleClaims: new Set(),
        hasPhysicianLink: false,
      }),
    ).toBe("admin");
  });
});
