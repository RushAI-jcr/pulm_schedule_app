import { query, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { requireAdmin } from "../lib/auth";
import { sortActivePhysicians } from "../lib/sorting";

// ========================================
// Shared helpers
// ========================================

async function getPhysicianMap(ctx: QueryCtx) {
  const physicians = await ctx.db.query("physicians").collect();
  const map = new Map<string, Doc<"physicians">>();
  for (const p of physicians) {
    map.set(String(p._id), p);
  }
  return { physicians, map };
}

async function getCalendarAndAssignments(
  ctx: QueryCtx,
  fiscalYearId: Id<"fiscalYears">,
) {
  const calendars = await ctx.db
    .query("masterCalendars")
    .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYearId))
    .collect();

  // Use published calendar if available, otherwise latest draft
  const published = calendars
    .filter((c) => c.status === "published")
    .sort((a, b) => b.version - a.version)[0];
  const calendar = published ?? calendars.sort((a, b) => b.version - a.version)[0] ?? null;

  if (!calendar) return { calendar: null, assignments: [] };

  const assignments = await ctx.db
    .query("assignments")
    .withIndex("by_calendar", (q) => q.eq("masterCalendarId", calendar._id))
    .collect();

  return { calendar, assignments };
}

// ========================================
// 1. Holiday Coverage Report
// ========================================

export const getHolidayCoverageReport = query({
  args: {
    fiscalYearIds: v.array(v.id("fiscalYears")),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    if (args.fiscalYearIds.length === 0) return { fiscalYears: [], holidays: [], physicians: [], coverage: [] };

    const { physicians, map: physicianMap } = await getPhysicianMap(ctx);
    const activePhysicians = sortActivePhysicians(physicians);

    const results: Array<{
      fiscalYearId: string;
      fiscalYearLabel: string;
      holidayName: string;
      holidayDate: string;
      weekNumber: number;
      physicianId: string;
      physicianInitials: string;
      physicianName: string;
      rotationName: string;
    }> = [];

    const fiscalYears: Array<{ _id: string; label: string }> = [];

    for (const fyId of args.fiscalYearIds) {
      const fy = await ctx.db.get(fyId);
      if (!fy) continue;
      fiscalYears.push({ _id: String(fy._id), label: fy.label });

      // Get holiday events for this FY
      const events = await ctx.db
        .query("calendarEvents")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fyId))
        .collect();
      const holidays = events.filter(
        (e) => e.category === "federal_holiday" && e.isApproved && e.isVisible,
      );

      if (holidays.length === 0) continue;

      // Get calendar assignments
      const { assignments } = await getCalendarAndAssignments(ctx, fyId);
      if (assignments.length === 0) continue;

      // Get weeks and rotations for lookup
      const weeks = await ctx.db
        .query("weeks")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fyId))
        .collect();
      const weekMap = new Map<string, Doc<"weeks">>();
      for (const w of weeks) weekMap.set(String(w._id), w);

      const rotations = await ctx.db
        .query("rotations")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fyId))
        .collect();
      const rotationMap = new Map<string, Doc<"rotations">>();
      for (const r of rotations) rotationMap.set(String(r._id), r);

      // Build assignment lookup: weekId -> physicianId -> rotationId
      const assignmentsByWeek = new Map<string, Array<{ physicianId: string; rotationId: string }>>();
      for (const a of assignments) {
        if (!a.physicianId) continue;
        const key = String(a.weekId);
        const arr = assignmentsByWeek.get(key) ?? [];
        arr.push({ physicianId: String(a.physicianId), rotationId: String(a.rotationId) });
        assignmentsByWeek.set(key, arr);
      }

      for (const holiday of holidays) {
        const week = weekMap.get(String(holiday.weekId));
        if (!week) continue;

        const weekAssignments = assignmentsByWeek.get(String(holiday.weekId)) ?? [];
        for (const wa of weekAssignments) {
          const physician = physicianMap.get(wa.physicianId);
          const rotation = rotationMap.get(wa.rotationId);
          if (!physician || !rotation) continue;

          results.push({
            fiscalYearId: String(fyId),
            fiscalYearLabel: fy.label,
            holidayName: holiday.name,
            holidayDate: holiday.date,
            weekNumber: week.weekNumber,
            physicianId: wa.physicianId,
            physicianInitials: physician.initials,
            physicianName: `${physician.lastName}, ${physician.firstName}`,
            rotationName: rotation.abbreviation,
          });
        }
      }
    }

    // Calculate fairness: count holidays worked per physician across selected FYs
    const fairness: Record<string, number> = {};
    for (const r of results) {
      fairness[r.physicianId] = (fairness[r.physicianId] ?? 0) + 1;
    }

    const fairnessArray = activePhysicians.map((p) => ({
      physicianId: String(p._id),
      physicianInitials: p.initials,
      physicianName: `${p.lastName}, ${p.firstName}`,
      holidayCount: fairness[String(p._id)] ?? 0,
    }));

    const avgHolidays = fairnessArray.length > 0
      ? fairnessArray.reduce((sum, f) => sum + f.holidayCount, 0) / fairnessArray.length
      : 0;

    return {
      fiscalYears,
      coverage: results,
      fairness: fairnessArray.map((f) => ({
        ...f,
        equity: f.holidayCount <= avgHolidays + 1
          ? f.holidayCount >= avgHolidays - 1
            ? "fair"
            : "underloaded"
          : "overloaded",
      })),
      avgHolidays: Math.round(avgHolidays * 100) / 100,
    };
  },
});

// ========================================
// 2. Rotation Distribution Report
// ========================================

export const getRotationDistributionReport = query({
  args: {
    fiscalYearId: v.id("fiscalYears"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const fy = await ctx.db.get(args.fiscalYearId);
    if (!fy) return null;

    const { physicians } = await getPhysicianMap(ctx);
    const activePhysicians = sortActivePhysicians(physicians);

    const rotations = await ctx.db
      .query("rotations")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", args.fiscalYearId))
      .collect();
    const activeRotations = rotations
      .filter((r) => r.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const { assignments } = await getCalendarAndAssignments(ctx, args.fiscalYearId);

    // Build matrix: physician x rotation -> week count
    const matrix: Record<string, Record<string, number>> = {};
    for (const p of activePhysicians) {
      matrix[String(p._id)] = {};
      for (const r of activeRotations) {
        matrix[String(p._id)][String(r._id)] = 0;
      }
    }

    for (const a of assignments) {
      if (!a.physicianId) continue;
      const pid = String(a.physicianId);
      const rid = String(a.rotationId);
      if (matrix[pid] && matrix[pid][rid] !== undefined) {
        matrix[pid][rid] += 1;
      }
    }

    return {
      fiscalYear: { _id: String(fy._id), label: fy.label },
      rotations: activeRotations.map((r) => ({
        _id: String(r._id),
        name: r.name,
        abbreviation: r.abbreviation,
      })),
      physicians: activePhysicians.map((p) => ({
        _id: String(p._id),
        initials: p.initials,
        name: `${p.lastName}, ${p.firstName}`,
      })),
      matrix,
    };
  },
});

// ========================================
// 3. cFTE Compliance Report
// ========================================

export const getCfteComplianceReport = query({
  args: {
    fiscalYearId: v.id("fiscalYears"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const fy = await ctx.db.get(args.fiscalYearId);
    if (!fy) return null;

    const { physicians } = await getPhysicianMap(ctx);
    const activePhysicians = sortActivePhysicians(physicians);

    // Get rotations for cFTE per week
    const rotations = await ctx.db
      .query("rotations")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", args.fiscalYearId))
      .collect();
    const rotationMap = new Map<string, Doc<"rotations">>();
    for (const r of rotations) rotationMap.set(String(r._id), r);

    // Get assignments
    const { assignments } = await getCalendarAndAssignments(ctx, args.fiscalYearId);

    // Calculate rotation cFTE per physician
    const rotationCfte: Record<string, number> = {};
    for (const a of assignments) {
      if (!a.physicianId) continue;
      const pid = String(a.physicianId);
      const rotation = rotationMap.get(String(a.rotationId));
      if (!rotation) continue;
      rotationCfte[pid] = (rotationCfte[pid] ?? 0) + rotation.cftePerWeek;
    }

    // Get clinic assignments for clinic cFTE
    const clinicTypes = await ctx.db
      .query("clinicTypes")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", args.fiscalYearId))
      .collect();
    const clinicTypeMap = new Map<string, Doc<"clinicTypes">>();
    for (const ct of clinicTypes) clinicTypeMap.set(String(ct._id), ct);

    const physicianClinics = await ctx.db
      .query("physicianClinics")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", args.fiscalYearId))
      .collect();

    // Clinic cFTE = sum(cftePerHalfDay * halfDaysPerWeek * activeWeeks / 52) per physician
    // Actually: clinic cFTE = sum(cftePerHalfDay * halfDaysPerWeek * activeWeeks) for the year
    // But since rotationCfte is sum of weekly cftePerWeek across assigned weeks,
    // clinic cFTE should be comparable: cftePerHalfDay * halfDaysPerWeek * activeWeeks
    const clinicCfte: Record<string, number> = {};
    for (const pc of physicianClinics) {
      const pid = String(pc.physicianId);
      const ct = clinicTypeMap.get(String(pc.clinicTypeId));
      if (!ct) continue;
      clinicCfte[pid] = (clinicCfte[pid] ?? 0) + ct.cftePerHalfDay * pc.halfDaysPerWeek * pc.activeWeeks;
    }

    // Get targets
    const targets = await ctx.db
      .query("physicianCfteTargets")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", args.fiscalYearId))
      .collect();
    const targetMap = new Map<string, number>();
    for (const t of targets) targetMap.set(String(t.physicianId), t.targetCfte);

    const rows = activePhysicians.map((p) => {
      const pid = String(p._id);
      const rotCfte = rotationCfte[pid] ?? 0;
      const clCfte = clinicCfte[pid] ?? 0;
      const actualCfte = Math.round((rotCfte + clCfte) * 10000) / 10000;
      const target = targetMap.get(pid) ?? null;
      const variance = target !== null ? Math.round((actualCfte - target) * 10000) / 10000 : null;

      return {
        physicianId: pid,
        initials: p.initials,
        name: `${p.lastName}, ${p.firstName}`,
        rotationCfte: Math.round(rotCfte * 10000) / 10000,
        clinicCfte: Math.round(clCfte * 10000) / 10000,
        actualCfte,
        targetCfte: target,
        variance,
        status: target === null
          ? "no_target"
          : Math.abs(actualCfte - target) <= 0.05
            ? "compliant"
            : actualCfte > target
              ? "over"
              : "under",
      };
    });

    const compliantCount = rows.filter((r) => r.status === "compliant").length;
    const withTarget = rows.filter((r) => r.targetCfte !== null).length;

    return {
      fiscalYear: { _id: String(fy._id), label: fy.label },
      rows,
      summary: {
        totalPhysicians: rows.length,
        withTarget,
        compliantCount,
        complianceRate: withTarget > 0 ? Math.round((compliantCount / withTarget) * 100) : 0,
        avgVariance: withTarget > 0
          ? Math.round(
              (rows.filter((r) => r.variance !== null).reduce((sum, r) => sum + Math.abs(r.variance!), 0) / withTarget) * 10000,
            ) / 10000
          : 0,
      },
    };
  },
});

// ========================================
// 4. Trade Activity Report
// ========================================

export const getTradeActivityReport = query({
  args: {
    fiscalYearId: v.id("fiscalYears"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const fy = await ctx.db.get(args.fiscalYearId);
    if (!fy) return null;

    const { map: physicianMap } = await getPhysicianMap(ctx);

    const trades = await ctx.db
      .query("tradeRequests")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", args.fiscalYearId))
      .collect();

    // Status breakdown
    const statusCounts: Record<string, number> = {};
    for (const t of trades) {
      statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
    }

    // Monthly volume (group by month of createdAt)
    const monthlyVolume: Record<string, number> = {};
    for (const t of trades) {
      const d = new Date(t.createdAt);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyVolume[monthKey] = (monthlyVolume[monthKey] ?? 0) + 1;
    }

    // Per-physician activity
    const physicianActivity: Record<string, { initiated: number; received: number; approved: number; denied: number }> = {};
    for (const t of trades) {
      const reqId = String(t.requestingPhysicianId);
      const tgtId = String(t.targetPhysicianId);

      if (!physicianActivity[reqId]) {
        physicianActivity[reqId] = { initiated: 0, received: 0, approved: 0, denied: 0 };
      }
      if (!physicianActivity[tgtId]) {
        physicianActivity[tgtId] = { initiated: 0, received: 0, approved: 0, denied: 0 };
      }

      physicianActivity[reqId].initiated += 1;
      physicianActivity[tgtId].received += 1;

      if (t.status === "admin_approved") {
        physicianActivity[reqId].approved += 1;
        physicianActivity[tgtId].approved += 1;
      }
      if (t.status === "admin_denied") {
        physicianActivity[reqId].denied += 1;
        physicianActivity[tgtId].denied += 1;
      }
    }

    // Resolution times (for completed trades)
    const resolved = trades.filter((t) => t.resolvedAt && (t.status === "admin_approved" || t.status === "admin_denied"));
    const resolutionTimes = resolved.map((t) => (t.resolvedAt! - t.createdAt) / (1000 * 60 * 60 * 24)); // days
    const avgResolutionDays = resolutionTimes.length > 0
      ? Math.round((resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length) * 10) / 10
      : 0;

    const topTraders = Object.entries(physicianActivity)
      .map(([pid, activity]) => {
        const p = physicianMap.get(pid);
        return {
          physicianId: pid,
          initials: p?.initials ?? "??",
          name: p ? `${p.lastName}, ${p.firstName}` : "Unknown",
          ...activity,
          total: activity.initiated + activity.received,
        };
      })
      .sort((a, b) => b.total - a.total);

    return {
      fiscalYear: { _id: String(fy._id), label: fy.label },
      totalTrades: trades.length,
      statusCounts,
      monthlyVolume: Object.entries(monthlyVolume)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, count]) => ({ month, count })),
      topTraders,
      avgResolutionDays,
      approvalRate: trades.length > 0
        ? Math.round(((statusCounts["admin_approved"] ?? 0) / trades.length) * 100)
        : 0,
    };
  },
});

// ========================================
// 5. Year-over-Year Report
// ========================================

export const getYearOverYearReport = query({
  args: {
    fiscalYearIds: v.array(v.id("fiscalYears")),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    if (args.fiscalYearIds.length === 0) return { fiscalYears: [], physicians: [], data: [] };

    const { physicians } = await getPhysicianMap(ctx);
    const activePhysicians = sortActivePhysicians(physicians);

    const fiscalYears: Array<{ _id: string; label: string }> = [];

    // Per FY: get rotations and physician week counts per rotation
    const data: Array<{
      physicianId: string;
      physicianInitials: string;
      physicianName: string;
      fiscalYearId: string;
      fiscalYearLabel: string;
      rotationId: string;
      rotationAbbreviation: string;
      weekCount: number;
    }> = [];

    for (const fyId of args.fiscalYearIds) {
      const fy = await ctx.db.get(fyId);
      if (!fy) continue;
      fiscalYears.push({ _id: String(fy._id), label: fy.label });

      const rotations = await ctx.db
        .query("rotations")
        .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fyId))
        .collect();
      const activeRotations = rotations.filter((r) => r.isActive);
      const rotationMap = new Map<string, Doc<"rotations">>();
      for (const r of activeRotations) rotationMap.set(String(r._id), r);

      const { assignments } = await getCalendarAndAssignments(ctx, fyId);

      // Count weeks per physician per rotation
      const counts: Record<string, Record<string, number>> = {};
      for (const a of assignments) {
        if (!a.physicianId) continue;
        const pid = String(a.physicianId);
        const rid = String(a.rotationId);
        if (!counts[pid]) counts[pid] = {};
        counts[pid][rid] = (counts[pid][rid] ?? 0) + 1;
      }

      for (const p of activePhysicians) {
        const pid = String(p._id);
        for (const r of activeRotations) {
          const rid = String(r._id);
          const weekCount = counts[pid]?.[rid] ?? 0;
          if (weekCount > 0) {
            data.push({
              physicianId: pid,
              physicianInitials: p.initials,
              physicianName: `${p.lastName}, ${p.firstName}`,
              fiscalYearId: String(fyId),
              fiscalYearLabel: fy.label,
              rotationId: rid,
              rotationAbbreviation: r.abbreviation,
              weekCount,
            });
          }
        }
      }
    }

    // Also compute total weeks per physician per FY for workload comparison
    const workloadByPhysicianFy: Record<string, Record<string, number>> = {};
    for (const d of data) {
      if (!workloadByPhysicianFy[d.physicianId]) workloadByPhysicianFy[d.physicianId] = {};
      workloadByPhysicianFy[d.physicianId][d.fiscalYearId] =
        (workloadByPhysicianFy[d.physicianId][d.fiscalYearId] ?? 0) + d.weekCount;
    }

    const workloadSummary = activePhysicians.map((p) => {
      const pid = String(p._id);
      const byFy: Record<string, number> = {};
      for (const fy of fiscalYears) {
        byFy[fy._id] = workloadByPhysicianFy[pid]?.[fy._id] ?? 0;
      }
      return {
        physicianId: pid,
        physicianInitials: p.initials,
        physicianName: `${p.lastName}, ${p.firstName}`,
        weeksByFiscalYear: byFy,
      };
    });

    return {
      fiscalYears,
      physicians: activePhysicians.map((p) => ({
        _id: String(p._id),
        initials: p.initials,
        name: `${p.lastName}, ${p.firstName}`,
      })),
      data,
      workloadSummary,
    };
  },
});

// ========================================
// Helper: List all fiscal years (for FY selector)
// ========================================

export const getAllFiscalYears = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("fiscalYears"),
      label: v.string(),
      status: v.union(
        v.literal("setup"),
        v.literal("collecting"),
        v.literal("building"),
        v.literal("published"),
        v.literal("archived"),
      ),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const fys = await ctx.db.query("fiscalYears").collect();
    return fys.map((fy) => ({
      _id: fy._id,
      label: fy.label,
      status: fy.status,
    }));
  },
});
