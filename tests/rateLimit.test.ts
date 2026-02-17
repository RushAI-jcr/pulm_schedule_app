import { describe, expect, it } from "vitest";
import {
  RATE_LIMIT_RULES,
  buildRateLimitErrorMessage,
  countRecentRateLimitEvents,
  isRateLimitExceeded,
} from "../convex/lib/rateLimit";

describe("rate limit helpers", () => {
  it("counts only events inside the configured window", () => {
    const now = 1_000_000;
    const windowMs = RATE_LIMIT_RULES.trade_propose.windowMs;
    const windowStart = now - windowMs;

    const recent = countRecentRateLimitEvents(
      [
        { timestamp: windowStart - 1 },
        { timestamp: windowStart },
        { timestamp: now - 10_000 },
      ],
      windowStart,
    );

    expect(recent).toBe(2);
  });

  it("flags limits once recent count reaches max", () => {
    const max = RATE_LIMIT_RULES.trade_respond.maxRequests;

    expect(isRateLimitExceeded("trade_respond", max - 1)).toBe(false);
    expect(isRateLimitExceeded("trade_respond", max)).toBe(true);
  });

  it("returns readable error messaging for users", () => {
    const message = buildRateLimitErrorMessage("schedule_request_submit");
    expect(message).toContain("Rate limit exceeded");
    expect(message).toContain("schedule submissions");
    expect(message).toContain(String(RATE_LIMIT_RULES.schedule_request_submit.maxRequests));
  });
});
