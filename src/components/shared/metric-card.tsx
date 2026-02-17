import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function MetricCard({
  label,
  value,
  subValue,
  className,
}: {
  label: string
  value: string | number
  subValue?: string
  className?: string
}) {
  return (
    <Card className={cn("", className)}>
      <CardContent className="p-4">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
        {subValue && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subValue}</p>
        )}
      </CardContent>
    </Card>
  )
}
