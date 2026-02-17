"use client"

import { useQuery } from "convex/react"
import {
  Calendar,
  Settings,
  BarChart3,
  FileText,
  Shield,
  ClipboardList,
} from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import { PageHeader } from "@/components/layout/page-header"
import { PageSkeleton } from "@/components/shared/loading-skeleton"
import { MetricCard } from "@/components/shared/metric-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { useFiscalYear } from "@/hooks/use-fiscal-year"
import Link from "next/link"

const adminLinks = [
  { href: "/admin/calendar", label: "Master Calendar", icon: Calendar, description: "Build and publish the 52-week schedule" },
  { href: "/admin/rotations", label: "Rotations", icon: FileText, description: "Manage rotations and clinic types" },
  { href: "/admin/cfte", label: "cFTE Targets", icon: BarChart3, description: "Set physician cFTE targets and clinic assignments" },
  { href: "/admin/requests", label: "Schedule Requests", icon: ClipboardList, description: "Review physician preferences and trade requests" },
  { href: "/admin/audit", label: "Audit Log", icon: Shield, description: "View system activity and changes" },
  { href: "/admin/settings", label: "Settings", icon: Settings, description: "Fiscal year lifecycle and data imports" },
]

export default function AdminDashboardPage() {
  const { fiscalYear, isLoading: fyLoading } = useFiscalYear()

  const physicianCount = useQuery(api.functions.physicians.getPhysicianCount)
  const scheduleRequests = useQuery(api.functions.scheduleRequests.getAdminScheduleRequests)
  const tradeQueue = useQuery(api.functions.tradeRequests.getAdminTradeQueue)

  const isLoading = fyLoading || physicianCount === undefined

  if (isLoading) {
    return (
      <>
        <PageHeader title="Admin Dashboard" description="System overview and quick actions" />
        <PageSkeleton />
      </>
    )
  }

  const submittedCount = scheduleRequests?.requests?.filter(
    (r) => r.status === "submitted" || r.status === "revised",
  ).length ?? 0
  const draftCount = scheduleRequests?.requests?.filter((r) => r.status === "draft").length ?? 0
  const pendingTradeCount = tradeQueue?.filter((t: { status: string }) => t.status === "peer_accepted").length ?? 0

  return (
    <>
      <PageHeader
        title="Admin Dashboard"
        description={fiscalYear ? `${fiscalYear.label}` : "No active fiscal year"}
        actions={
          fiscalYear ? (
            <StatusBadge status={fiscalYear.status} />
          ) : null
        }
      />
      <div className="flex-1 space-y-6 p-4 md:p-6">
        {/* Metrics */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Physicians"
            value={physicianCount ?? 0}
          />
          <MetricCard
            label="Submitted Requests"
            value={submittedCount}
            subValue={draftCount > 0 ? `${draftCount} draft` : undefined}
          />
          <MetricCard
            label="Pending Trades"
            value={pendingTradeCount}
          />
          <MetricCard
            label="FY Status"
            value={fiscalYear?.status ?? "N/A"}
            subValue={fiscalYear?.requestDeadline ? `Deadline: ${fiscalYear.requestDeadline}` : undefined}
          />
        </div>

        {/* Quick Links */}
        <div>
          <h2 className="text-sm font-semibold mb-3">Admin Pages</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {adminLinks.map((link) => {
              const Icon = link.icon
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"
                >
                  <Icon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <span className="text-sm font-medium">{link.label}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">{link.description}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
