"use client"

import { BarChart3 } from "lucide-react"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" description="Scheduling analytics and compliance reports" />
      <div className="flex-1 p-6">
        <EmptyState
          icon={BarChart3}
          title="Reports dashboard coming soon"
          description="Holiday coverage, rotation distribution, cFTE compliance, trade activity, and year-over-year trend reports."
        />
      </div>
    </>
  )
}
