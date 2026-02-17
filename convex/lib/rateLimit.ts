import { Id } from "../_generated/dataModel";
import { MutationCtx } from "../_generated/server";

export type SensitiveMutationAction =
  | "schedule_request_save"
  | "schedule_week_preference_set"
  | "schedule_request_import"
  | "schedule_request_submit"
  | "trade_propose"
  | "trade_respond"
  | "trade_cancel"
  | "trade_admin_resolve";

type RateLimitRule = {
  maxRequests: number;
  windowMs: number;
  label: string;
};

type TimestampedEvent = {
  timestamp: number;
};

export const RATE_LIMIT_RULES: Record<SensitiveMutationAction, RateLimitRule> = {
  schedule_request_save: {
    maxRequests: 60,
    windowMs: 60 * 60 * 1000,
    label: "schedule request saves",
  },
  schedule_week_preference_set: {
    maxRequests: 200,
    windowMs: 60 * 60 * 1000,
    label: "week preference updates",
  },
  schedule_request_import: {
    maxRequests: 30,
    windowMs: 60 * 60 * 1000,
    label: "schedule imports",
  },
  schedule_request_submit: {
    maxRequests: 20,
    windowMs: 60 * 60 * 1000,
    label: "schedule submissions",
  },
  trade_propose: {
    maxRequests: 20,
    windowMs: 60 * 60 * 1000,
    label: "trade proposals",
  },
  trade_respond: {
    maxRequests: 30,
    windowMs: 60 * 60 * 1000,
    label: "trade responses",
  },
  trade_cancel: {
    maxRequests: 30,
    windowMs: 60 * 60 * 1000,
    label: "trade cancellations",
  },
  trade_admin_resolve: {
    maxRequests: 120,
    windowMs: 60 * 60 * 1000,
    label: "admin trade resolutions",
  },
};

function formatWindowMinutes(windowMs: number): number {
  return Math.max(1, Math.round(windowMs / 60000));
}

export function buildRateLimitErrorMessage(action: SensitiveMutationAction): string {
  const rule = RATE_LIMIT_RULES[action];
  const minutes = formatWindowMinutes(rule.windowMs);
  return `Rate limit exceeded for ${rule.label}. Max ${rule.maxRequests} per ${minutes} minutes.`;
}

export function countRecentRateLimitEvents(
  events: Array<TimestampedEvent>,
  windowStart: number,
): number {
  return events.filter((event) => event.timestamp >= windowStart).length;
}

export function isRateLimitExceeded(
  action: SensitiveMutationAction,
  recentCount: number,
): boolean {
  return recentCount >= RATE_LIMIT_RULES[action].maxRequests;
}

export async function enforceRateLimit(
  ctx: MutationCtx,
  actorPhysicianId: Id<"physicians">,
  action: SensitiveMutationAction,
  now = Date.now(),
) {
  const rule = RATE_LIMIT_RULES[action];
  const windowStart = now - rule.windowMs;

  const recentEvents = await ctx.db
    .query("rateLimitEvents")
    .withIndex("by_actor_action", (q) =>
      q
        .eq("actorPhysicianId", actorPhysicianId)
        .eq("action", action)
        .gte("timestamp", windowStart),
    )
    .collect();

  const recentCount = recentEvents.length;
  if (isRateLimitExceeded(action, recentCount)) {
    throw new Error(buildRateLimitErrorMessage(action));
  }

  await ctx.db.insert("rateLimitEvents", {
    actorPhysicianId,
    action,
    timestamp: now,
  });
}
