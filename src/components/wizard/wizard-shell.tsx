"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ChevronLeft, ChevronRight, Check, Loader2 } from "lucide-react"

export type WizardStep = {
  label: string
  description?: string
}

const DEFAULT_STEPS: WizardStep[] = [
  { label: "Week Availability", description: "Mark your available weeks" },
  { label: "Rotation Preferences", description: "Rank your rotation preferences" },
  { label: "Review & Submit", description: "Review and submit your request" },
]

type SaveStatus = "idle" | "saving" | "saved" | "error"

export function WizardShell({
  steps = DEFAULT_STEPS,
  currentStep,
  onStepChange,
  onBack,
  onNext,
  canGoNext = true,
  saveStatus = "idle",
  readOnly = false,
  children,
}: {
  steps?: WizardStep[]
  currentStep: number
  onStepChange: (step: number) => void
  onBack?: () => void
  onNext?: () => void
  canGoNext?: boolean
  saveStatus?: SaveStatus
  readOnly?: boolean
  children: React.ReactNode
}) {
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === steps.length - 1

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-center justify-between">
        <nav aria-label="Wizard progress" className="flex-1">
          {/* Desktop stepper */}
          <ol className="hidden sm:flex items-center gap-2">
            {steps.map((step, index) => {
              const isCompleted = index < currentStep
              const isCurrent = index === currentStep

              return (
                <li key={step.label} className="flex items-center gap-2">
                  {index > 0 && (
                    <Separator className="w-8 shrink-0" />
                  )}
                  <button
                    onClick={() => !readOnly && onStepChange(index)}
                    disabled={readOnly}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                      isCurrent && "bg-primary/10 text-primary font-medium",
                      isCompleted && "text-primary cursor-pointer hover:bg-accent",
                      !isCurrent && !isCompleted && "text-muted-foreground",
                      readOnly && "cursor-default",
                    )}
                  >
                    <Badge
                      variant={isCurrent ? "default" : isCompleted ? "secondary" : "outline"}
                      className={cn(
                        "h-6 w-6 rounded-full p-0 flex items-center justify-center text-xs",
                        isCompleted && "bg-primary text-primary-foreground",
                      )}
                    >
                      {isCompleted ? <Check className="h-3 w-3" /> : index + 1}
                    </Badge>
                    <span className="hidden lg:inline">{step.label}</span>
                  </button>
                </li>
              )
            })}
          </ol>

          {/* Mobile stepper */}
          <div className="sm:hidden flex items-center justify-between">
            <span className="text-sm font-medium">
              Step {currentStep + 1} of {steps.length}
            </span>
            <span className="text-sm text-muted-foreground">
              {steps[currentStep].label}
            </span>
          </div>
        </nav>

        {/* Save status indicator */}
        {!readOnly && (
          <div className="ml-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            {saveStatus === "saving" && (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Saving...</span>
              </>
            )}
            {saveStatus === "saved" && (
              <>
                <Check className="h-3 w-3 text-emerald-600" />
                <span>Draft saved</span>
              </>
            )}
            {saveStatus === "error" && (
              <span className="text-destructive">Save failed</span>
            )}
          </div>
        )}
      </div>

      {/* Step content */}
      <div className="min-h-[400px]">{children}</div>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button
          variant="ghost"
          onClick={onBack ?? (() => onStepChange(currentStep - 1))}
          disabled={isFirstStep}
          className={cn(isFirstStep && "invisible")}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back
        </Button>

        {!isLastStep && (
          <Button
            onClick={onNext ?? (() => onStepChange(currentStep + 1))}
            disabled={!canGoNext}
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
