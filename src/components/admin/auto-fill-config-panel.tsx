"use client"

import { useState, useEffect, useCallback } from "react"
import { useQuery, useMutation } from "convex/react"
import { Loader2, RotateCcw } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/shared/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import { PriorYearHolidaySummary } from "./prior-year-holiday-summary"

const DEFAULT_WEIGHTS = {
  weightPreference: 30,
  weightHolidayParity: 25,
  weightWorkloadSpread: 20,
  weightRotationVariety: 15,
  weightGapEnforcement: 10,
}
const DEFAULT_MAJOR_HOLIDAYS = ["Thanksgiving Day", "Christmas Day"]
const DEFAULT_MIN_GAP = 2

const WEIGHT_LABELS: Record<string, string> = {
  weightPreference: "Week Preference",
  weightHolidayParity: "Holiday Parity",
  weightWorkloadSpread: "Workload Spread",
  weightRotationVariety: "Rotation Variety",
  weightGapEnforcement: "Gap Enforcement",
}

interface AutoFillConfigPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fiscalYearId: Id<"fiscalYears">
}

export function AutoFillConfigPanel({ open, onOpenChange, fiscalYearId }: AutoFillConfigPanelProps) {
  const config = useQuery(api.functions.autoFillConfig.getAutoFillConfig, { fiscalYearId })
  const upsert = useMutation(api.functions.autoFillConfig.upsertAutoFillConfig)

  const [weights, setWeights] = useState(DEFAULT_WEIGHTS)
  const [majorHolidays, setMajorHolidays] = useState<string[]>(DEFAULT_MAJOR_HOLIDAYS)
  const [minGap, setMinGap] = useState(DEFAULT_MIN_GAP)
  const [newHoliday, setNewHoliday] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sync local state from server config
  useEffect(() => {
    if (config && !config.isDefault) {
      setWeights({
        weightPreference: config.weightPreference,
        weightHolidayParity: config.weightHolidayParity,
        weightWorkloadSpread: config.weightWorkloadSpread,
        weightRotationVariety: config.weightRotationVariety,
        weightGapEnforcement: config.weightGapEnforcement,
      })
      setMajorHolidays(config.majorHolidayNames)
      setMinGap(config.minGapWeeksBetweenStints)
    }
  }, [config])

  const weightSum = Object.values(weights).reduce((a, b) => a + b, 0)
  const isValid = weightSum === 100

  const handleWeightChange = useCallback((key: string, raw: string) => {
    const val = parseInt(raw, 10)
    if (isNaN(val) || val < 0) return
    setWeights((prev) => ({ ...prev, [key]: val }))
  }, [])

  const handleResetDefaults = useCallback(() => {
    setWeights(DEFAULT_WEIGHTS)
    setMajorHolidays(DEFAULT_MAJOR_HOLIDAYS)
    setMinGap(DEFAULT_MIN_GAP)
  }, [])

  const handleAddHoliday = useCallback(() => {
    const trimmed = newHoliday.trim()
    if (!trimmed) return
    if (majorHolidays.some((h) => h.toLowerCase() === trimmed.toLowerCase())) return
    setMajorHolidays((prev) => [...prev, trimmed])
    setNewHoliday("")
  }, [newHoliday, majorHolidays])

  const handleRemoveHoliday = useCallback((name: string) => {
    setMajorHolidays((prev) => prev.filter((h) => h !== name))
  }, [])

  const handleSave = async () => {
    if (!isValid) return
    setIsSaving(true)
    setError(null)
    try {
      await upsert({
        fiscalYearId,
        ...weights,
        majorHolidayNames: majorHolidays,
        minGapWeeksBetweenStints: minGap,
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save configuration")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Auto-Fill Settings</SheetTitle>
          <SheetDescription>
            Configure the algorithm weights and holiday parity settings.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-4">
          {/* Scoring Weights */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Scoring Weights</Label>
              <span className={`text-xs font-mono ${isValid ? "text-emerald-600" : "text-rose-600"}`}>
                Sum: {weightSum}/100
              </span>
            </div>
            {Object.entries(WEIGHT_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center gap-3">
                <Label className="w-32 text-xs text-muted-foreground">{label}</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="w-20 h-8 text-sm"
                  value={weights[key as keyof typeof weights]}
                  onChange={(e) => handleWeightChange(key, e.target.value)}
                />
              </div>
            ))}
          </div>

          {/* Major Holidays */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Major Holidays (Parity Enforced)</Label>
            <div className="flex flex-wrap gap-1.5">
              {majorHolidays.map((h) => (
                <Badge
                  key={h}
                  variant="secondary"
                  className="cursor-pointer hover:bg-destructive/20"
                  onClick={() => handleRemoveHoliday(h)}
                >
                  {h} &times;
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                className="h-8 text-sm"
                placeholder="Add holiday name..."
                value={newHoliday}
                onChange={(e) => setNewHoliday(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddHoliday()}
              />
              <Button size="sm" variant="outline" onClick={handleAddHoliday} disabled={!newHoliday.trim()}>
                Add
              </Button>
            </div>
          </div>

          {/* Min Gap */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Min Gap Between Stints</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={10}
                className="w-20 h-8 text-sm"
                value={minGap}
                onChange={(e) => setMinGap(parseInt(e.target.value, 10) || 0)}
              />
              <span className="text-xs text-muted-foreground">weeks</span>
            </div>
          </div>

          {/* Prior Year Holiday Summary */}
          <PriorYearHolidaySummary />

          {/* Error */}
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        <SheetFooter className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={handleResetDefaults}>
            <RotateCcw className="mr-1 h-3 w-3" />
            Reset Defaults
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!isValid || isSaving}>
            {isSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
