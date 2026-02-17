import { Check, AlertTriangle, X } from "lucide-react"
import { cn } from "@/lib/utils"

type AvailabilityLevel = "green" | "yellow" | "red"

const config: Record<AvailabilityLevel, {
  icon: typeof Check
  bgClass: string
  textClass: string
  label: string
}> = {
  green: {
    icon: Check,
    bgClass: "bg-emerald-50 dark:bg-emerald-950/30",
    textClass: "text-emerald-700 dark:text-emerald-400",
    label: "Available",
  },
  yellow: {
    icon: AlertTriangle,
    bgClass: "bg-amber-50 dark:bg-amber-950/30",
    textClass: "text-amber-700 dark:text-amber-400",
    label: "Prefer Not",
  },
  red: {
    icon: X,
    bgClass: "bg-rose-50 dark:bg-rose-950/30",
    textClass: "text-rose-700 dark:text-rose-400",
    label: "Unavailable",
  },
}

export function AvailabilityIndicator({
  level,
  showLabel = false,
  size = "sm",
  className,
}: {
  level: AvailabilityLevel
  showLabel?: boolean
  size?: "sm" | "md"
  className?: string
}) {
  const { icon: Icon, bgClass, textClass, label } = config[level]
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"
  const padding = size === "sm" ? "p-1" : "p-1.5"

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md font-medium",
        bgClass,
        textClass,
        showLabel ? `${padding} px-2 text-xs` : padding,
        className,
      )}
      role="status"
      aria-label={label}
    >
      <Icon className={iconSize} aria-hidden="true" />
      {showLabel && <span>{label}</span>}
    </span>
  )
}
