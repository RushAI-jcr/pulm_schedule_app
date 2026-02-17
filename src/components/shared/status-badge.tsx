import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const statusStyles: Record<string, string> = {
  // Fiscal year statuses
  setup: "bg-gray-100 text-gray-700 border-gray-200",
  collecting: "bg-blue-50 text-blue-700 border-blue-200",
  building: "bg-amber-50 text-amber-700 border-amber-200",
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
  archived: "bg-gray-100 text-gray-500 border-gray-200",

  // Schedule request statuses
  draft: "bg-gray-100 text-gray-600 border-gray-200",
  submitted: "bg-blue-50 text-blue-700 border-blue-200",
  revised: "bg-amber-50 text-amber-700 border-amber-200",

  // Trade statuses
  proposed: "bg-blue-50 text-blue-700 border-blue-200",
  peer_accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  peer_declined: "bg-rose-50 text-rose-700 border-rose-200",
  admin_approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  admin_denied: "bg-rose-50 text-rose-700 border-rose-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",

  // Generic
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inactive: "bg-gray-100 text-gray-500 border-gray-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  denied: "bg-rose-50 text-rose-700 border-rose-200",
}

function formatStatusLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string
  label?: string
  className?: string
}) {
  const style = statusStyles[status] ?? "bg-gray-100 text-gray-600 border-gray-200"

  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-medium", style, className)}
    >
      {label ?? formatStatusLabel(status)}
    </Badge>
  )
}
