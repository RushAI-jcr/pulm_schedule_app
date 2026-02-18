import { describe, expect, it } from "vitest";
import {
  isAutoNameLinkDomainAllowed,
  isPhysicianNameAutoLinkEnabled,
} from "../convex/lib/physicianLinking";

describe("physician auto-name-link domain policy", () => {
  it("defaults to rush.edu only", () => {
    expect(isAutoNameLinkDomainAllowed("doctor@rush.edu", undefined)).toBe(true);
    expect(isAutoNameLinkDomainAllowed("doctor@gmail.com", undefined)).toBe(false);
  });

  it("respects explicit allowlist", () => {
    const allowlist = "rush.edu,gmail.com";
    expect(isAutoNameLinkDomainAllowed("doctor@gmail.com", allowlist)).toBe(true);
    expect(isAutoNameLinkDomainAllowed("doctor@yahoo.com", allowlist)).toBe(false);
  });

  it("blocks hostile personal-domain collision by default policy", () => {
    expect(isAutoNameLinkDomainAllowed("attacker+same-name@gmail.com", undefined)).toBe(false);
  });

  it("supports wildcard allowlist", () => {
    expect(isAutoNameLinkDomainAllowed("doctor@yahoo.com", "*")).toBe(true);
  });
});

describe("physician auto-name-link enablement", () => {
  it("defaults disabled when unset", () => {
    expect(isPhysicianNameAutoLinkEnabled(undefined)).toBe(false);
  });

  it("enables only for explicit true", () => {
    expect(isPhysicianNameAutoLinkEnabled("true")).toBe(true);
    expect(isPhysicianNameAutoLinkEnabled("TRUE")).toBe(true);
    expect(isPhysicianNameAutoLinkEnabled("false")).toBe(false);
    expect(isPhysicianNameAutoLinkEnabled("1")).toBe(false);
  });
});
