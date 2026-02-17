import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { FiscalYearStatus, canEditRequestForFiscalYear } from "./workflowPolicy";
import { isRequestDeadlineOpen } from "./fiscalYear";

type AnyCtx = QueryCtx | MutationCtx;

export function requireCollectingWindow(
  fiscalYear: Pick<Doc<"fiscalYears">, "status" | "requestDeadline">,
  now = Date.now(),
) {
  const fiscalYearStatus = fiscalYear.status as FiscalYearStatus;
  if (!canEditRequestForFiscalYear(fiscalYearStatus)) {
    throw new Error("Scheduling requests are only editable while fiscal year is collecting");
  }
  if (!isRequestDeadlineOpen(fiscalYear, now)) {
    throw new Error("Request deadline has passed for this fiscal year");
  }
}

export async function getOrCreateRequest(
  ctx: AnyCtx,
  physicianId: Id<"physicians">,
  fiscalYearId: Id<"fiscalYears">,
): Promise<Doc<"scheduleRequests">> {
  const existing = await ctx.db
    .query("scheduleRequests")
    .withIndex("by_physician_fy", (q) => q.eq("physicianId", physicianId).eq("fiscalYearId", fiscalYearId))
    .unique();

  if (existing) return existing;

  // Create new draft request
  const requestId = await (ctx as MutationCtx).db.insert("scheduleRequests", {
    physicianId,
    fiscalYearId,
    status: "draft",
  });

  return (await ctx.db.get(requestId))!;
}
