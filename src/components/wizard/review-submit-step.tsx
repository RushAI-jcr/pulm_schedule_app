"use client"

import { useState, useMemo, useCallback } from "react"
import { useMutation } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { cn } from "@/lib/utils"
import { Button } from "@/shared/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { AvailabilityIndicator } from "@/components/shared/availability-indicator"
import {
  Check,
  AlertTriangle,
  Send,
  Loader2,
  Calendar,
  Star,
  ThumbsDown,
  Ban,
  CheckCircle2,
} from "lucide-react"

type Availability = "green" | "yellow" | "red"

type ReviewData = {
  weekPreferences: Array<{
    weekId: Id<"weeks">
    weekNumber: number
    startDate: string
    endDate: string
    availability: Availability
    reasonCategory?: string
    reasonText?: string
  }>
  rotationPreferences: Array<{
    rotationName: string
    rotationAbbr: string
    preferenceRank?: number
    avoid: boolean
    deprioritize?: boolean
    avoidReason?: string
    isConfigured: boolean
  }>
  specialRequests?: string
  requestStatus: "draft" | "submitted" | "revised"
  rotationCompleteness: {
    configured: number
    required: number
    isComplete: boolean
  }
}

export function ReviewSubmitStep({
  data,
  totalWeeks,
  readOnly = false,
  onSaveStatusChange,
  onSubmitted,
}: {
  data: ReviewData
  totalWeeks: number
  readOnly?: boolean
  onSaveStatusChange?: (status: "idle" | "saving" | "saved" | "error") => void
  onSubmitted?: () => void
}) {
  const saveRequest = useMutation(api.functions.scheduleRequests.saveMyScheduleRequest)
  const submitRequest = useMutation(api.functions.scheduleRequests.submitMyScheduleRequest)

  const [specialRequests, setSpecialRequests] = useState(data.specialRequests ?? "")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Week availability counts
  const weekCounts = useMemo(() => {
    let green = 0, yellow = 0, red = 0
    for (const wp of data.weekPreferences) {
      if (wp.availability === "green") green++
      else if (wp.availability === "yellow") yellow++
      else if (wp.availability === "red") red++
    }
    const unset = totalWeeks - data.weekPreferences.length
    return { green, yellow, red, unset }
  }, [data.weekPreferences, totalWeeks])

  // Validation warnings
  const warnings = useMemo(() => {
    const w: string[] = []
    if (weekCounts.unset > 0) {
      w.push(`${weekCounts.unset} week(s) have no availability set. Unset weeks default to "Available".`)
    }
    if (weekCounts.red === 0 && weekCounts.yellow === 0) {
      w.push("You marked 0 weeks as unavailable or prefer-not. Is this correct?")
    }
    if (!data.rotationCompleteness.isComplete) {
      w.push(
        `Rotation preferences incomplete: ${data.rotationCompleteness.configured} of ${data.rotationCompleteness.required} configured.`,
      )
    }
    return w
  }, [weekCounts, data.rotationCompleteness])

  const canSubmit = data.rotationCompleteness.isComplete && !readOnly

  const handleSaveSpecialRequests = useCallback(async () => {
    onSaveStatusChange?.("saving")
    try {
      await saveRequest({ specialRequests: specialRequests || undefined })
      onSaveStatusChange?.("saved")
    } catch {
      onSaveStatusChange?.("error")
    }
  }, [specialRequests, saveRequest, onSaveStatusChange])

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      // Save special requests first
      if (specialRequests) {
        await saveRequest({ specialRequests })
      }
      await submitRequest({})
      setSubmitSuccess(true)
      setConfirmOpen(false)
      onSubmitted?.()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [specialRequests, saveRequest, submitRequest, onSubmitted])

  if (submitSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-emerald-100 p-4 dark:bg-emerald-900/30">
          <CheckCircle2 className="h-12 w-12 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h3 className="mt-4 text-lg font-semibold">Request Submitted</h3>
        <p className="mt-2 text-sm text-muted-foreground max-w-md">
          Your schedule request has been submitted successfully. You can return to edit
          your preferences at any time before the collection window closes.
        </p>
        <Button variant="outline" className="mt-6" asChild>
          <a href="/calendar">
            <Calendar className="mr-2 h-4 w-4" />
            Return to Calendar
          </a>
        </Button>
      </div>
    )
  }

  const isResubmit = data.requestStatus === "submitted" || data.requestStatus === "revised"

  return (
    <div className="space-y-6">
      {/* Week Availability Summary */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Week Availability</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <AvailabilityIndicator level="green" />
              <span className="text-xs font-medium">Available</span>
            </div>
            <span className="text-2xl font-bold">{weekCounts.green}</span>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <AvailabilityIndicator level="yellow" />
              <span className="text-xs font-medium">Prefer Not</span>
            </div>
            <span className="text-2xl font-bold">{weekCounts.yellow}</span>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <AvailabilityIndicator level="red" />
              <span className="text-xs font-medium">Unavailable</span>
            </div>
            <span className="text-2xl font-bold">{weekCounts.red}</span>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <span className="text-xs font-medium text-muted-foreground">Unset</span>
            </div>
            <span className="text-2xl font-bold text-muted-foreground">{weekCounts.unset}</span>
          </div>
        </div>

        {/* Mini heatmap */}
        <div className="flex flex-wrap gap-0.5">
          {Array.from({ length: totalWeeks }, (_, i) => {
            const wp = data.weekPreferences.find((p) => p.weekNumber === i + 1)
            return (
              <div
                key={i}
                className={cn(
                  "h-3 w-3 rounded-sm",
                  wp?.availability === "green" && "bg-emerald-500",
                  wp?.availability === "yellow" && "bg-amber-500",
                  wp?.availability === "red" && "bg-rose-500",
                  !wp && "bg-muted",
                )}
                title={`Week ${i + 1}: ${wp?.availability ?? "unset"}`}
              />
            )
          })}
        </div>
      </section>

      {/* Rotation Preferences Summary */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Rotation Preferences</h3>
          <Badge
            variant={data.rotationCompleteness.isComplete ? "secondary" : "destructive"}
            className={cn(
              data.rotationCompleteness.isComplete && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
            )}
          >
            {data.rotationCompleteness.configured}/{data.rotationCompleteness.required}
          </Badge>
        </div>

        <div className="rounded-lg border divide-y">
          {data.rotationPreferences.map((rp) => {
            let typeLabel: string
            let TypeIcon: typeof Star
            let colorClass: string

            if (rp.avoid) {
              typeLabel = "Do Not Assign"
              TypeIcon = Ban
              colorClass = "text-rose-600 dark:text-rose-400"
            } else if (rp.deprioritize) {
              typeLabel = "Prefer Not"
              TypeIcon = ThumbsDown
              colorClass = "text-orange-600 dark:text-orange-400"
            } else if (rp.preferenceRank !== undefined) {
              typeLabel = `Preferred #${rp.preferenceRank}`
              TypeIcon = Star
              colorClass = "text-amber-600 dark:text-amber-400"
            } else {
              typeLabel = rp.isConfigured ? "Willing" : "Not Set"
              TypeIcon = Check
              colorClass = rp.isConfigured ? "text-foreground" : "text-muted-foreground"
            }

            return (
              <div key={rp.rotationAbbr} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <span className="text-sm font-medium">{rp.rotationName}</span>
                  <span className="ml-2 text-xs text-muted-foreground">({rp.rotationAbbr})</span>
                </div>
                <span className={cn("flex items-center gap-1.5 text-xs font-medium", colorClass)}>
                  <TypeIcon className="h-3.5 w-3.5" />
                  {typeLabel}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      {/* Special Requests */}
      <section className="space-y-2">
        <Label htmlFor="special-requests" className="text-sm font-semibold">
          Special Requests
        </Label>
        <Textarea
          id="special-requests"
          placeholder="Any additional scheduling requests or notes for the admin..."
          value={specialRequests}
          onChange={(e) => setSpecialRequests(e.target.value)}
          onBlur={handleSaveSpecialRequests}
          disabled={readOnly}
          rows={3}
          className="text-sm"
        />
      </section>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <span className="text-xs text-amber-800 dark:text-amber-300">{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Submit error */}
      {submitError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2">
          <p className="text-xs text-destructive">{submitError}</p>
        </div>
      )}

      {/* Submit button */}
      {!readOnly && (
        <div className="flex justify-end">
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger asChild>
              <Button disabled={!canSubmit} size="lg">
                <Send className="mr-2 h-4 w-4" />
                {isResubmit ? "Re-submit Request" : "Submit Request"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {isResubmit ? "Re-submit Schedule Request?" : "Submit Schedule Request?"}
                </DialogTitle>
                <DialogDescription>
                  {isResubmit
                    ? "Your updated preferences will replace the previous submission. You can edit and re-submit again before the deadline."
                    : "Once submitted, the admin will use your preferences to build the annual schedule. You can edit and re-submit before the collection deadline."}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isResubmit ? "Re-submit" : "Submit"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  )
}
