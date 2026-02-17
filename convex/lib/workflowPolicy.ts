export type FiscalYearStatus = "setup" | "collecting" | "building" | "published" | "archived";

export type ScheduleRequestStatus = "draft" | "submitted" | "revised";

export type TradeStatus =
  | "proposed"
  | "peer_accepted"
  | "peer_declined"
  | "admin_approved"
  | "admin_denied"
  | "cancelled";

export function canEditRequestForFiscalYear(status: FiscalYearStatus): boolean {
  return status === "collecting";
}

export function canTransitionFiscalYearStatus(
  from: FiscalYearStatus,
  to: FiscalYearStatus,
): boolean {
  if (from === to) return true;

  if (from === "setup") return to === "collecting";
  if (from === "collecting") return to === "building";
  if (from === "building") return to === "published";
  if (from === "published") return to === "archived";
  return false;
}

export function nextScheduleRequestStatusAfterSave(
  current: ScheduleRequestStatus,
): ScheduleRequestStatus {
  return current === "submitted" ? "revised" : current;
}

export function canProposeTradeForFiscalYear(status: FiscalYearStatus): boolean {
  return status === "published";
}

export function canProposeTradeAssignments(params: {
  actorPhysicianId: string;
  requesterAssignmentPhysicianId: string | null;
  targetAssignmentPhysicianId: string | null;
}): boolean {
  return (
    params.requesterAssignmentPhysicianId === params.actorPhysicianId &&
    !!params.targetAssignmentPhysicianId &&
    params.targetAssignmentPhysicianId !== params.actorPhysicianId
  );
}

export function canTargetRespondToTrade(params: {
  actorPhysicianId: string;
  targetPhysicianId: string;
  status: TradeStatus;
}): boolean {
  return params.actorPhysicianId === params.targetPhysicianId && params.status === "proposed";
}

export function canRequesterCancelTrade(params: {
  actorPhysicianId: string;
  requestingPhysicianId: string;
  status: TradeStatus;
}): boolean {
  return (
    params.actorPhysicianId === params.requestingPhysicianId &&
    (params.status === "proposed" || params.status === "peer_accepted")
  );
}

export function canAdminApproveTrade(status: TradeStatus): boolean {
  return status === "peer_accepted";
}

export function canAdminDenyTrade(status: TradeStatus): boolean {
  return status === "proposed" || status === "peer_accepted";
}
