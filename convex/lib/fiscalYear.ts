import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";

type AnyCtx = QueryCtx | MutationCtx;

export const ACTIVE_FISCAL_YEAR_STATUSES = [
  "setup",
  "collecting",
  "building",
  "published",
] as const;

export type ActiveFiscalYearStatus = (typeof ACTIVE_FISCAL_YEAR_STATUSES)[number];

function isActiveStatus(status: Doc<"fiscalYears">["status"]): status is ActiveFiscalYearStatus {
  return ACTIVE_FISCAL_YEAR_STATUSES.includes(status as ActiveFiscalYearStatus);
}

export async function listActiveFiscalYears(ctx: AnyCtx) {
  const all: Array<Doc<"fiscalYears">> = [];
  for (const status of ACTIVE_FISCAL_YEAR_STATUSES) {
    const rows = await ctx.db
      .query("fiscalYears")
      .withIndex("by_status", (q) => q.eq("status", status))
      .collect();
    all.push(...rows);
  }
  return all;
}

export async function getSingleActiveFiscalYear(ctx: AnyCtx) {
  const active = await listActiveFiscalYears(ctx);
  if (active.length === 0) return null;
  if (active.length > 1) {
    throw new Error("Data integrity error: multiple active fiscal years exist");
  }
  return active[0];
}

export async function ensureCanActivateFiscalYear(
  ctx: AnyCtx,
  fiscalYearId: Id<"fiscalYears">,
) {
  const active = await listActiveFiscalYears(ctx);
  const conflicting = active.find((fy) => fy._id !== fiscalYearId && isActiveStatus(fy.status));
  if (conflicting) {
    throw new Error(`Another active fiscal year already exists (${conflicting.label})`);
  }
}

export async function ensureNoActiveFiscalYear(ctx: AnyCtx) {
  const active = await listActiveFiscalYears(ctx);
  if (active.length > 0) {
    throw new Error(`Another active fiscal year already exists (${active[0].label})`);
  }
}

export function parseRequestDeadlineMs(
  fiscalYear: Pick<Doc<"fiscalYears">, "requestDeadline">,
): number | null {
  if (!fiscalYear.requestDeadline) return null;
  const parsed = Date.parse(fiscalYear.requestDeadline);
  if (Number.isNaN(parsed)) {
    throw new Error("Fiscal year request deadline is invalid");
  }
  return parsed;
}

export function isRequestDeadlineOpen(
  fiscalYear: Pick<Doc<"fiscalYears">, "requestDeadline">,
  now = Date.now(),
) {
  const deadlineMs = parseRequestDeadlineMs(fiscalYear);
  if (deadlineMs === null) return true;
  return now <= deadlineMs;
}
