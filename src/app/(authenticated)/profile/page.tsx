"use client"

import { User } from "lucide-react"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="Profile" description="Your account and notification settings" />
      <div className="flex-1 p-6">
        <EmptyState
          icon={User}
          title="Profile settings coming soon"
          description="Manage your notification preferences, calendar export, and account details here."
        />
      </div>
    </>
  )
}
