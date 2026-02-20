import { describe, expect, it } from "vitest";
import { buildAdminRotationPreferencePayload } from "../src/lib/adminRotationPreference";

describe("admin rotation preference payload builder", () => {
  it("builds preferred payload with parsed rank", () => {
    const result = buildAdminRotationPreferencePayload({
      mode: "preferred",
      preferenceRankInput: "3",
      noteInput: "ignored",
    });

    expect(result).toEqual({
      ok: true,
      payload: {
        mode: "preferred",
        preferenceRank: 3,
      },
    });
  });

  it("rejects preferred mode when rank is invalid", () => {
    const badRank = buildAdminRotationPreferencePayload({
      mode: "preferred",
      preferenceRankInput: "0",
      noteInput: "",
    });
    expect(badRank).toEqual({
      ok: false,
      message: "Preferred mode requires a rank of 1 or higher.",
    });

    const nonNumeric = buildAdminRotationPreferencePayload({
      mode: "preferred",
      preferenceRankInput: "abc",
      noteInput: "",
    });
    expect(nonNumeric).toEqual({
      ok: false,
      message: "Preferred mode requires a rank of 1 or higher.",
    });
  });

  it("builds do_not_assign payload with trimmed optional note", () => {
    const withNote = buildAdminRotationPreferencePayload({
      mode: "do_not_assign",
      preferenceRankInput: "2",
      noteInput: "  unsafe for this physician  ",
    });
    expect(withNote).toEqual({
      ok: true,
      payload: {
        mode: "do_not_assign",
        note: "unsafe for this physician",
      },
    });

    const blankNote = buildAdminRotationPreferencePayload({
      mode: "do_not_assign",
      preferenceRankInput: "2",
      noteInput: "   ",
    });
    expect(blankNote).toEqual({
      ok: true,
      payload: {
        mode: "do_not_assign",
        note: undefined,
      },
    });
  });

  it("builds willing and deprioritize payloads without rank/note", () => {
    const willing = buildAdminRotationPreferencePayload({
      mode: "willing",
      preferenceRankInput: "4",
      noteInput: "ignored",
    });
    expect(willing).toEqual({
      ok: true,
      payload: {
        mode: "willing",
      },
    });

    const deprioritize = buildAdminRotationPreferencePayload({
      mode: "deprioritize",
      preferenceRankInput: "2",
      noteInput: "ignored",
    });
    expect(deprioritize).toEqual({
      ok: true,
      payload: {
        mode: "deprioritize",
      },
    });
  });
});

