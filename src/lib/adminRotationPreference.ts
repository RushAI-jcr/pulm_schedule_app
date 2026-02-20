export type AdminRotationPreferenceMode =
  | "do_not_assign"
  | "deprioritize"
  | "willing"
  | "preferred";

export type AdminRotationPreferencePayload = {
  mode: AdminRotationPreferenceMode;
  preferenceRank?: number;
  note?: string;
};

type BuildPayloadArgs = {
  mode: AdminRotationPreferenceMode;
  preferenceRankInput: string;
  noteInput: string;
};

export function buildAdminRotationPreferencePayload(args: BuildPayloadArgs):
  | { ok: true; payload: AdminRotationPreferencePayload }
  | { ok: false; message: string } {
  if (args.mode === "preferred") {
    const rank = parseInt(args.preferenceRankInput, 10);
    if (!Number.isInteger(rank) || rank < 1) {
      return {
        ok: false,
        message: "Preferred mode requires a rank of 1 or higher.",
      };
    }

    return {
      ok: true,
      payload: {
        mode: args.mode,
        preferenceRank: rank,
      },
    };
  }

  if (args.mode === "do_not_assign") {
    const trimmedNote = args.noteInput.trim();
    return {
      ok: true,
      payload: {
        mode: args.mode,
        note: trimmedNote || undefined,
      },
    };
  }

  return {
    ok: true,
    payload: {
      mode: args.mode,
    },
  };
}

