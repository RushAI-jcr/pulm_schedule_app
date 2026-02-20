import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { AppRole } from "./roles";
import {
  FiscalYearStatus,
  canAdminImportRequestForFiscalYear,
  canEditRequestForFiscalYear,
} from "./workflowPolicy";
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

export function requireImportWindow(args: {
  fiscalYear: Pick<Doc<"fiscalYears">, "status" | "requestDeadline">;
  actorRole: AppRole;
  now?: number;
}) {
  const now = args.now ?? Date.now();
  const fiscalYearStatus = args.fiscalYear.status as FiscalYearStatus;

  if (args.actorRole === "admin") {
    if (!canAdminImportRequestForFiscalYear(fiscalYearStatus)) {
      throw new Error(
        "Admin imports are only available while fiscal year is collecting or building",
      );
    }
    return;
  }

  requireCollectingWindow(args.fiscalYear, now);
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
  const now = Date.now();
  const requestId = await (ctx as MutationCtx).db.insert("scheduleRequests", {
    physicianId,
    fiscalYearId,
    status: "draft",
    lastActivityAt: now,
    revisionCount: 0,
  });

  return (await ctx.db.get(requestId))!;
}

export function buildRequestActivityPatch(params: {
  request: Pick<Doc<"scheduleRequests">, "status" | "revisionCount">;
  nextStatus?: "draft" | "submitted" | "revised";
  now?: number;
}) {
  const now = params.now ?? Date.now();
  const patch: {
    status?: "draft" | "submitted" | "revised";
    revisionCount?: number;
    lastActivityAt: number;
  } = {
    lastActivityAt: now,
  };

  if (params.nextStatus && params.nextStatus !== params.request.status) {
    patch.status = params.nextStatus;
    if (params.request.status === "submitted" && params.nextStatus === "revised") {
      patch.revisionCount = (params.request.revisionCount ?? 0) + 1;
    }
  }

  return patch;
}
