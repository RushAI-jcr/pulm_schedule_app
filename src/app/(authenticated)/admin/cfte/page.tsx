"use client"

import { useState, useCallback } from "react"
import { useQuery, useMutation } from "convex/react"
import { Target } from "lucide-react"
import { api } from "../../../../../convex/_generated/api"
import type { Id } from "../../../../../convex/_generated/dataModel"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { PageSkeleton } from "@/components/shared/loading-skeleton"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

function CfteTargetsTab() {
  const data = useQuery(api.functions.cfteTargets.getCurrentFiscalYearCfteTargets)
  const upsertTarget = useMutation(api.functions.cfteTargets.upsertCurrentFiscalYearCfteTarget)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")

  if (data === undefined) return <PageSkeleton />
  if (!data?.fiscalYear) {
    return (
      <EmptyState
        icon={Target}
        title="No active fiscal year"
        description="Create and activate a fiscal year first."
      />
    )
  }

  const handleEdit = (physicianId: string, currentValue: number | null) => {
    setEditingId(physicianId)
    setEditValue(currentValue?.toString() ?? "")
  }

  const handleSave = async (physicianId: string) => {
    const value = parseFloat(editValue)
    if (isNaN(value)) {
      setEditingId(null)
      return
    }
    try {
      await upsertTarget({ physicianId: physicianId as Id<"physicians">, targetCfte: value })
    } catch {
      // Handled by Convex error
    }
    setEditingId(null)
  }

  const configuredCount = data.targets.filter((t) => t.targetCfte !== null).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data.fiscalYear.label} &middot; {configuredCount}/{data.targets.length} configured
        </p>
      </div>

      <div className="rounded-lg border">
        <div className="grid grid-cols-[1fr_80px_100px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground hidden md:grid">
          <span>Physician</span>
          <span className="text-center">Role</span>
          <span className="text-center">Target cFTE</span>
        </div>
        {data.targets.map((target) => (
          <div
            key={String(target.physicianId)}
            className="grid grid-cols-1 md:grid-cols-[1fr_80px_100px] gap-2 items-center px-4 py-2.5 border-b last:border-b-0"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{target.physicianName}</span>
              <span className="text-xs text-muted-foreground">({target.initials})</span>
            </div>
            <div className="hidden md:flex justify-center">
              <Badge variant="outline" className="text-xs">
                {target.role}
              </Badge>
            </div>
            <div className="flex justify-center">
              {editingId === String(target.physicianId) ? (
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1.50"
                  className="h-7 w-20 text-center text-sm"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => handleSave(String(target.physicianId))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave(String(target.physicianId))
                    if (e.key === "Escape") setEditingId(null)
                  }}
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => handleEdit(String(target.physicianId), target.targetCfte)}
                  className={cn(
                    "rounded px-3 py-1 text-sm transition-colors hover:bg-accent",
                    target.targetCfte === null ? "text-muted-foreground" : "font-medium",
                  )}
                >
                  {target.targetCfte?.toFixed(2) ?? "—"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ClinicAssignmentsTab() {
  const data = useQuery(api.functions.physicianClinics.getCurrentFiscalYearPhysicianClinics)
  const upsert = useMutation(api.functions.physicianClinics.upsertPhysicianClinicAssignment)
  const remove = useMutation(api.functions.physicianClinics.removePhysicianClinicAssignment)

  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")

  if (data === undefined) return <PageSkeleton />
  if (!data?.fiscalYear) {
    return (
      <EmptyState
        icon={Target}
        title="No active fiscal year"
        description="Create and activate a fiscal year first."
      />
    )
  }

  const handleEdit = (key: string, currentValue: number | null) => {
    setEditingCell(key)
    setEditValue(currentValue?.toString() ?? "")
  }

  const handleSave = async (physicianId: string, clinicTypeId: string) => {
    const value = parseFloat(editValue)
    if (isNaN(value) || value <= 0) {
      // Remove assignment if empty or zero
      try {
        await remove({
          physicianId: physicianId as Id<"physicians">,
          clinicTypeId: clinicTypeId as Id<"clinicTypes">,
        })
      } catch {
        // Ignore
      }
    } else {
      try {
        await upsert({
          physicianId: physicianId as Id<"physicians">,
          clinicTypeId: clinicTypeId as Id<"clinicTypes">,
          halfDaysPerWeek: value,
          activeWeeks: 52,
        })
      } catch {
        // Ignore
      }
    }
    setEditingCell(null)
  }

  const clinicTypes = data.clinicTypes ?? []
  const physicians = data.physicians ?? []
  const assignments = data.assignments ?? []

  const assignmentMap = new Map<string, number>()
  for (const a of assignments as any[]) {
    assignmentMap.set(`${a.physicianId}:${a.clinicTypeId}`, a.halfDaysPerWeek)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {data.fiscalYear.label} &middot; Half-days per week per clinic type
      </p>

      {clinicTypes.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No clinic types"
          description="Add clinic types in the Rotations page first."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Physician</th>
                {clinicTypes.map((ct: any) => (
                  <th key={String(ct._id)} className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                    {ct.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {physicians.map((p: any) => (
                <tr key={String(p._id)} className="border-b last:border-b-0">
                  <td className="px-4 py-2 font-medium text-sm whitespace-nowrap">
                    {p.lastName}, {p.firstName}
                  </td>
                  {clinicTypes.map((ct: any) => {
                    const key = `${p._id}:${ct._id}`
                    const value = assignmentMap.get(key) ?? null

                    return (
                      <td key={String(ct._id)} className="px-3 py-2 text-center">
                        {editingCell === key ? (
                          <Input
                            type="number"
                            step="0.5"
                            min="0"
                            className="h-7 w-16 text-center text-sm mx-auto"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleSave(String(p._id), String(ct._id))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSave(String(p._id), String(ct._id))
                              if (e.key === "Escape") setEditingCell(null)
                            }}
                            autoFocus
                          />
                        ) : (
                          <button
                            onClick={() => handleEdit(key, value)}
                            className={cn(
                              "rounded px-2 py-0.5 transition-colors hover:bg-accent",
                              value === null ? "text-muted-foreground/30" : "font-medium",
                            )}
                          >
                            {value ?? "—"}
                          </button>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function CftePage() {
  return (
    <>
      <PageHeader title="cFTE & Clinic Assignments" description="Set clinical FTE targets and clinic allocations" />
      <div className="flex-1 p-4 md:p-6">
        <Tabs defaultValue="cfte">
          <TabsList>
            <TabsTrigger value="cfte">cFTE Targets</TabsTrigger>
            <TabsTrigger value="clinics">Clinic Assignments</TabsTrigger>
          </TabsList>
          <TabsContent value="cfte" className="mt-4">
            <CfteTargetsTab />
          </TabsContent>
          <TabsContent value="clinics" className="mt-4">
            <ClinicAssignmentsTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
