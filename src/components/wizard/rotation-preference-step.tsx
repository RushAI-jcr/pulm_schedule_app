"use client"

import { useState, useCallback, useMemo } from "react"
import { useMutation } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Check, Star, ThumbsDown, Ban, Minus } from "lucide-react"

type PreferenceType = "preferred" | "willing" | "deprioritize" | "avoid"

type RotationData = {
  rotation: {
    _id: Id<"rotations">
    name: string
    abbreviation: string
    cftePerWeek: number
    maxConsecutiveWeeks: number
  }
  preference: {
    preferenceRank?: number
    avoid: boolean
    deprioritize?: boolean
    avoidReason?: string
  } | null
}

function getPreferenceType(pref: RotationData["preference"]): PreferenceType {
  if (!pref) return "willing"
  if (pref.avoid) return "avoid"
  if (pref.deprioritize) return "deprioritize"
  if (pref.preferenceRank !== undefined) return "preferred"
  return "willing"
}

const PREFERENCE_OPTIONS: Array<{
  value: PreferenceType
  label: string
  icon: typeof Star
  description: string
}> = [
  { value: "preferred", label: "Preferred", icon: Star, description: "I want this rotation (set rank)" },
  { value: "willing", label: "Willing", icon: Check, description: "I'm okay with this rotation" },
  { value: "deprioritize", label: "Prefer Not", icon: ThumbsDown, description: "Schedule me here only if needed" },
  { value: "avoid", label: "Do Not Assign", icon: Ban, description: "Do not schedule me here" },
]

export function RotationPreferenceStep({
  rotations,
  readOnly = false,
  onSaveStatusChange,
}: {
  rotations: RotationData[]
  readOnly?: boolean
  onSaveStatusChange?: (status: "idle" | "saving" | "saved" | "error") => void
}) {
  const setRotationPref = useMutation(api.functions.rotationPreferences.setMyRotationPreference)

  const [localPrefs, setLocalPrefs] = useState<
    Map<string, { type: PreferenceType; rank?: number; avoidReason?: string }>
  >(() => {
    const map = new Map()
    for (const r of rotations) {
      const type = getPreferenceType(r.preference)
      map.set(String(r.rotation._id), {
        type,
        rank: r.preference?.preferenceRank,
        avoidReason: r.preference?.avoidReason,
      })
    }
    return map
  })

  const configuredCount = useMemo(() => {
    // Count rotations that have been explicitly configured (have a preference in backend)
    return rotations.filter((r) => r.preference !== null).length
  }, [rotations])

  const handlePreferenceChange = useCallback(
    async (rotationId: Id<"rotations">, type: PreferenceType, rank?: number, avoidReason?: string) => {
      if (readOnly) return

      setLocalPrefs((prev) => {
        const next = new Map(prev)
        next.set(String(rotationId), { type, rank, avoidReason })
        return next
      })

      onSaveStatusChange?.("saving")
      try {
        await setRotationPref({
          rotationId,
          preferenceRank: type === "preferred" ? (rank ?? 1) : undefined,
          avoid: type === "avoid",
          deprioritize: type === "deprioritize",
          avoidReason: type === "avoid" ? avoidReason : undefined,
        })
        onSaveStatusChange?.("saved")
      } catch {
        onSaveStatusChange?.("error")
      }
    },
    [readOnly, setRotationPref, onSaveStatusChange],
  )

  return (
    <div className="space-y-4">
      {/* Progress indicator */}
      <div className="flex items-center gap-2 rounded-lg border p-3">
        <span className="text-sm font-medium">Progress:</span>
        <span className="text-sm text-muted-foreground">
          {configuredCount} of {rotations.length} rotations configured
        </span>
        {configuredCount === rotations.length && (
          <Badge variant="secondary" className="ml-auto bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            <Check className="mr-1 h-3 w-3" />
            Complete
          </Badge>
        )}
      </div>

      {/* Rotation cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        {rotations.map((r) => {
          const pref = localPrefs.get(String(r.rotation._id))
          const currentType = pref?.type ?? "willing"
          const currentRank = pref?.rank
          const currentReason = pref?.avoidReason

          return (
            <div
              key={String(r.rotation._id)}
              className={cn(
                "rounded-lg border p-4 space-y-3 transition-colors",
                currentType === "preferred" && "border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20",
                currentType === "avoid" && "border-rose-200 bg-rose-50/50 dark:border-rose-900/50 dark:bg-rose-950/20",
                currentType === "deprioritize" && "border-orange-200 dark:border-orange-900/50",
              )}
            >
              {/* Rotation header */}
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-semibold">{r.rotation.name}</h4>
                  <p className="text-xs text-muted-foreground">
                    {r.rotation.abbreviation} &middot; {r.rotation.cftePerWeek} cFTE/wk &middot; Max {r.rotation.maxConsecutiveWeeks} consecutive
                  </p>
                </div>
                {r.preference !== null && (
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                )}
              </div>

              {/* Preference selector */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Preference</Label>
                <Select
                  value={currentType}
                  onValueChange={(val) => {
                    const newType = val as PreferenceType
                    handlePreferenceChange(
                      r.rotation._id,
                      newType,
                      newType === "preferred" ? (currentRank ?? 1) : undefined,
                      newType === "avoid" ? currentReason : undefined,
                    )
                  }}
                  disabled={readOnly}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PREFERENCE_OPTIONS.map((opt) => {
                      const Icon = opt.icon
                      return (
                        <SelectItem key={opt.value} value={opt.value}>
                          <span className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" />
                            {opt.label}
                          </span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Rank input for preferred */}
              {currentType === "preferred" && (
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">
                    Rank (1 = most preferred)
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={rotations.length}
                    className="h-8 w-20 text-sm"
                    value={currentRank ?? 1}
                    onChange={(e) => {
                      const rank = parseInt(e.target.value, 10)
                      if (!isNaN(rank) && rank >= 1) {
                        handlePreferenceChange(r.rotation._id, "preferred", rank)
                      }
                    }}
                    disabled={readOnly}
                  />
                </div>
              )}

              {/* Avoid reason */}
              {currentType === "avoid" && (
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">
                    Reason (required)
                  </Label>
                  <Input
                    className="h-8 text-sm"
                    placeholder="Why should you not be assigned here?"
                    value={currentReason ?? ""}
                    onChange={(e) => {
                      const reason = e.target.value
                      setLocalPrefs((prev) => {
                        const next = new Map(prev)
                        next.set(String(r.rotation._id), {
                          type: "avoid",
                          avoidReason: reason,
                        })
                        return next
                      })
                    }}
                    onBlur={() => {
                      handlePreferenceChange(r.rotation._id, "avoid", undefined, currentReason)
                    }}
                    disabled={readOnly}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
