"use client"

import { ArrowLeftRight } from "lucide-react"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"

export default function TradesPage() {
  return (
    <>
      <PageHeader title="Trades" description="Request and manage schedule trades with colleagues" />
      <div className="flex-1 p-6">
        <EmptyState
          icon={ArrowLeftRight}
          title="Trade center coming soon"
          description="You'll be able to propose, accept, and track rotation trades here."
        />
      </div>
    </>
  )
}
