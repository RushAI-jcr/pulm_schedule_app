import { describe, expect, it } from "vitest";
import {
  canAdminApproveTrade,
  canAdminDenyTrade,
  canEditRequestForFiscalYear,
  canProposeTradeAssignments,
  canProposeTradeForFiscalYear,
  canRequesterCancelTrade,
  canTargetRespondToTrade,
  nextScheduleRequestStatusAfterSave,
} from "../convex/lib/workflowPolicy";

describe("schedule request lifecycle policy", () => {
  it("allows request edits only during collecting phase", () => {
    expect(canEditRequestForFiscalYear("collecting")).toBe(true);
    expect(canEditRequestForFiscalYear("setup")).toBe(false);
    expect(canEditRequestForFiscalYear("building")).toBe(false);
    expect(canEditRequestForFiscalYear("published")).toBe(false);
    expect(canEditRequestForFiscalYear("archived")).toBe(false);
  });

  it("transitions submitted request to revised on save", () => {
    expect(nextScheduleRequestStatusAfterSave("draft")).toBe("draft");
    expect(nextScheduleRequestStatusAfterSave("submitted")).toBe("revised");
    expect(nextScheduleRequestStatusAfterSave("revised")).toBe("revised");
  });
});

describe("trade lifecycle policy", () => {
  it("allows proposing trades only once schedule is published", () => {
    expect(canProposeTradeForFiscalYear("published")).toBe(true);
    expect(canProposeTradeForFiscalYear("collecting")).toBe(false);
    expect(canProposeTradeForFiscalYear("building")).toBe(false);
  });

  it("requires proposer to own offered assignment and target another physician", () => {
    expect(
      canProposeTradeAssignments({
        actorPhysicianId: "A",
        requesterAssignmentPhysicianId: "A",
        targetAssignmentPhysicianId: "B",
      }),
    ).toBe(true);

    expect(
      canProposeTradeAssignments({
        actorPhysicianId: "A",
        requesterAssignmentPhysicianId: "B",
        targetAssignmentPhysicianId: "C",
      }),
    ).toBe(false);

    expect(
      canProposeTradeAssignments({
        actorPhysicianId: "A",
        requesterAssignmentPhysicianId: "A",
        targetAssignmentPhysicianId: "A",
      }),
    ).toBe(false);
  });

  it("allows only target physician to accept or decline proposed trades", () => {
    expect(
      canTargetRespondToTrade({
        actorPhysicianId: "B",
        targetPhysicianId: "B",
        status: "proposed",
      }),
    ).toBe(true);

    expect(
      canTargetRespondToTrade({
        actorPhysicianId: "A",
        targetPhysicianId: "B",
        status: "proposed",
      }),
    ).toBe(false);

    expect(
      canTargetRespondToTrade({
        actorPhysicianId: "B",
        targetPhysicianId: "B",
        status: "peer_accepted",
      }),
    ).toBe(false);
  });

  it("allows only requester to cancel while unresolved", () => {
    expect(
      canRequesterCancelTrade({
        actorPhysicianId: "A",
        requestingPhysicianId: "A",
        status: "proposed",
      }),
    ).toBe(true);

    expect(
      canRequesterCancelTrade({
        actorPhysicianId: "A",
        requestingPhysicianId: "A",
        status: "peer_accepted",
      }),
    ).toBe(true);

    expect(
      canRequesterCancelTrade({
        actorPhysicianId: "B",
        requestingPhysicianId: "A",
        status: "proposed",
      }),
    ).toBe(false);

    expect(
      canRequesterCancelTrade({
        actorPhysicianId: "A",
        requestingPhysicianId: "A",
        status: "admin_approved",
      }),
    ).toBe(false);
  });

  it("requires peer acceptance before admin approval", () => {
    expect(canAdminApproveTrade("peer_accepted")).toBe(true);
    expect(canAdminApproveTrade("proposed")).toBe(false);
    expect(canAdminApproveTrade("peer_declined")).toBe(false);
  });

  it("allows admin denial for proposed or peer accepted trades", () => {
    expect(canAdminDenyTrade("proposed")).toBe(true);
    expect(canAdminDenyTrade("peer_accepted")).toBe(true);
    expect(canAdminDenyTrade("admin_approved")).toBe(false);
    expect(canAdminDenyTrade("cancelled")).toBe(false);
  });
});
