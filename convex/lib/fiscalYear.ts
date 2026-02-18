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

export function isActiveFiscalYearStatus(
  status: Doc<"fiscalYears">["status"],
): status is ActiveFiscalYearStatus {
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

function parseDateMs(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function pickMostRelevantFiscalYear(
  fiscalYears: Array<Doc<"fiscalYears">>,
  now = Date.now(),
): Doc<"fiscalYears"> {
  const enriched = fiscalYears.map((fy) => ({
    fy,
    startMs: parseDateMs(fy.startDate),
    endMs: parseDateMs(fy.endDate),
  }));

  const containingNow = enriched
    .filter(({ startMs, endMs }) => startMs !== null && endMs !== null && startMs <= now && now <= endMs)
    .sort((a, b) => (b.startMs ?? 0) - (a.startMs ?? 0));
  if (containingNow.length > 0) return containingNow[0].fy;

  const upcoming = enriched
    .filter(({ startMs }) => startMs !== null && startMs > now)
    .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
  if (upcoming.length > 0) return upcoming[0].fy;

  const past = enriched
    .filter(({ endMs }) => endMs !== null && endMs < now)
    .sort((a, b) => (b.endMs ?? 0) - (a.endMs ?? 0));
  if (past.length > 0) return past[0].fy;

  return [...fiscalYears].sort((a, b) => b._creationTime - a._creationTime)[0];
}

export async function getSingleActiveFiscalYear(ctx: AnyCtx) {
  const active = await listActiveFiscalYears(ctx);
  if (active.length === 0) return null;
  if (active.length === 1) return active[0];

  // Backward-compatible recovery for datasets that include both current and future years.
  const nonSetup = active.filter((fy) => fy.status !== "setup");
  if (nonSetup.length > 0) return pickMostRelevantFiscalYear(nonSetup);
  return pickMostRelevantFiscalYear(active);
}

export async function ensureCanActivateFiscalYear(
  ctx: AnyCtx,
  fiscalYearId: Id<"fiscalYears">,
) {
  const active = await listActiveFiscalYears(ctx);
  const conflicting = active.find(
    (fy) => fy._id !== fiscalYearId && isActiveFiscalYearStatus(fy.status),
  );
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
