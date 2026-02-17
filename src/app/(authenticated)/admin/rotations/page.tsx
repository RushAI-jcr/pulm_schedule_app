"use client"

import { useState } from "react"
import { useQuery, useMutation } from "convex/react"
import { Stethoscope, Plus, Check, X } from "lucide-react"
import { api } from "../../../../../convex/_generated/api"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { PageSkeleton } from "@/components/shared/loading-skeleton"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

function RotationsTab() {
  const data = useQuery(api.functions.rotations.getCurrentFiscalYearRotations)
  const createRotation = useMutation(api.functions.rotations.createRotation)
  const setRotationActive = useMutation(api.functions.rotations.setRotationActive)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState("")
  const [abbreviation, setAbbreviation] = useState("")
  const [cftePerWeek, setCftePerWeek] = useState("0.02")
  const [minStaff, setMinStaff] = useState("1")
  const [maxConsecutiveWeeks, setMaxConsecutiveWeeks] = useState("2")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (data === undefined) return <PageSkeleton />
  if (!data?.fiscalYear) {
    return (
      <EmptyState
        icon={Stethoscope}
        title="No active fiscal year"
        description="Create and activate a fiscal year first."
      />
    )
  }

  const handleCreate = async () => {
    setIsSaving(true)
    setError(null)
    try {
      await createRotation({
        name,
        abbreviation,
        cftePerWeek: parseFloat(cftePerWeek),
        minStaff: parseInt(minStaff, 10),
        maxConsecutiveWeeks: parseInt(maxConsecutiveWeeks, 10),
      })
      setDialogOpen(false)
      setName("")
      setAbbreviation("")
      setCftePerWeek("0.02")
      setMinStaff("1")
      setMaxConsecutiveWeeks("2")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create rotation")
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleActive = async (rotationId: string, isActive: boolean) => {
    try {
      await setRotationActive({ rotationId: rotationId as any, isActive })
    } catch (err) {
      // Silently handle - UI will reflect current state via reactive query
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {data.fiscalYear.label} &middot; {data.rotations.length} rotation(s)
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Canonical: Pulm, MICU 1, MICU 2, AICU, LTAC, ROPH, IP, PFT
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              Add Rotation
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Rotation</DialogTitle>
              <DialogDescription>
                Create a new rotation for {data.fiscalYear.label}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pulm" disabled={isSaving} />
                </div>
                <div>
                  <Label className="text-xs">Abbreviation</Label>
                  <Input value={abbreviation} onChange={(e) => setAbbreviation(e.target.value)} placeholder="PULM" disabled={isSaving} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">cFTE/week</Label>
                  <Input type="number" step="0.001" value={cftePerWeek} onChange={(e) => setCftePerWeek(e.target.value)} disabled={isSaving} />
                </div>
                <div>
                  <Label className="text-xs">Min Staff</Label>
                  <Input type="number" value={minStaff} onChange={(e) => setMinStaff(e.target.value)} disabled={isSaving} />
                </div>
                <div>
                  <Label className="text-xs">Max Consecutive Wks</Label>
                  <Input type="number" value={maxConsecutiveWeeks} onChange={(e) => setMaxConsecutiveWeeks(e.target.value)} disabled={isSaving} />
                </div>
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={isSaving || !name || !abbreviation}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Rotations table */}
      <div className="rounded-lg border">
        <div className="grid grid-cols-[1fr_80px_80px_80px_80px_80px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground hidden md:grid">
          <span>Rotation</span>
          <span className="text-center">Abbrev</span>
          <span className="text-center">cFTE/wk</span>
          <span className="text-center">Min Staff</span>
          <span className="text-center">Max Wks</span>
          <span className="text-center">Status</span>
        </div>
        {data.rotations.map((rotation) => (
          <div
            key={String(rotation._id)}
            className={cn(
              "grid grid-cols-1 md:grid-cols-[1fr_80px_80px_80px_80px_80px] gap-2 items-center px-4 py-3 border-b last:border-b-0",
              !rotation.isActive && "opacity-50",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{rotation.name}</span>
              <span className="md:hidden text-xs text-muted-foreground">({rotation.abbreviation})</span>
            </div>
            <span className="hidden md:block text-center text-sm">{rotation.abbreviation}</span>
            <span className="hidden md:block text-center text-sm">{rotation.cftePerWeek}</span>
            <span className="hidden md:block text-center text-sm">{rotation.minStaff}</span>
            <span className="hidden md:block text-center text-sm">{rotation.maxConsecutiveWeeks}</span>
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggleActive(String(rotation._id), !rotation.isActive)}
                className={cn(
                  "h-7 text-xs",
                  rotation.isActive ? "text-emerald-700" : "text-muted-foreground",
                )}
              >
                {rotation.isActive ? (
                  <><Check className="mr-1 h-3 w-3" />Active</>
                ) : (
                  <><X className="mr-1 h-3 w-3" />Inactive</>
                )}
              </Button>
            </div>
          </div>
        ))}
        {data.rotations.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No rotations configured. Add the first rotation above.
          </p>
        )}
      </div>
    </div>
  )
}

function ClinicTypesTab() {
  const data = useQuery(api.functions.clinicTypes.getCurrentFiscalYearClinicTypes)
  const createClinicType = useMutation(api.functions.clinicTypes.createClinicType)
  const setClinicTypeActive = useMutation(api.functions.clinicTypes.setClinicTypeActive)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState("")
  const [cftePerHalfDay, setCftePerHalfDay] = useState("0.1")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (data === undefined) return <PageSkeleton />
  if (!data?.fiscalYear) {
    return (
      <EmptyState
        icon={Stethoscope}
        title="No active fiscal year"
        description="Create and activate a fiscal year first."
      />
    )
  }

  const handleCreate = async () => {
    setIsSaving(true)
    setError(null)
    try {
      await createClinicType({ name, cftePerHalfDay: parseFloat(cftePerHalfDay) })
      setDialogOpen(false)
      setName("")
      setCftePerHalfDay("0.1")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create clinic type")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data.fiscalYear.label} &middot; {data.clinicTypes.length} clinic type(s)
        </p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              Add Clinic Type
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Clinic Type</DialogTitle>
              <DialogDescription>
                Create a new clinic type for {data.fiscalYear.label}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="General Pulm" disabled={isSaving} />
              </div>
              <div>
                <Label className="text-xs">cFTE per half-day</Label>
                <Input type="number" step="0.01" value={cftePerHalfDay} onChange={(e) => setCftePerHalfDay(e.target.value)} disabled={isSaving} />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={isSaving || !name}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border">
        <div className="grid grid-cols-[1fr_100px_80px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground hidden md:grid">
          <span>Clinic Type</span>
          <span className="text-center">cFTE/half-day</span>
          <span className="text-center">Status</span>
        </div>
        {data.clinicTypes.map((ct: any) => (
          <div
            key={String(ct._id)}
            className={cn(
              "grid grid-cols-1 md:grid-cols-[1fr_100px_80px] gap-2 items-center px-4 py-3 border-b last:border-b-0",
              !ct.isActive && "opacity-50",
            )}
          >
            <span className="text-sm font-medium">{ct.name}</span>
            <span className="hidden md:block text-center text-sm">{ct.cftePerHalfDay}</span>
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setClinicTypeActive({ clinicTypeId: ct._id, isActive: !ct.isActive })}
                className={cn("h-7 text-xs", ct.isActive ? "text-emerald-700" : "text-muted-foreground")}
              >
                {ct.isActive ? <><Check className="mr-1 h-3 w-3" />Active</> : <><X className="mr-1 h-3 w-3" />Inactive</>}
              </Button>
            </div>
          </div>
        ))}
        {data.clinicTypes.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No clinic types configured.
          </p>
        )}
      </div>
    </div>
  )
}

export default function RotationsPage() {
  return (
    <>
      <PageHeader title="Rotations & Clinic Types" description="Configure rotation types and clinic assignments" />
      <div className="flex-1 p-4 md:p-6">
        <Tabs defaultValue="rotations">
          <TabsList>
            <TabsTrigger value="rotations">Rotations</TabsTrigger>
            <TabsTrigger value="clinic-types">Clinic Types</TabsTrigger>
          </TabsList>
          <TabsContent value="rotations" className="mt-4">
            <RotationsTab />
          </TabsContent>
          <TabsContent value="clinic-types" className="mt-4">
            <ClinicTypesTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
