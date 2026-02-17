"use client"

import { useState } from "react"
import { useQuery, useMutation } from "convex/react"
import { Users, Plus, Pencil, UserX, AlertCircle } from "lucide-react"
import { api } from "../../../../../convex/_generated/api"
import type { Id } from "../../../../../convex/_generated/dataModel"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { PageSkeleton } from "@/components/shared/loading-skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useFiscalYear } from "@/hooks/use-fiscal-year"
import { toast } from "sonner"

type PhysicianWithStatus = {
  _id: Id<"physicians">
  firstName: string
  lastName: string
  initials: string
  email: string
  role: "physician" | "admin"
  isActive: boolean
  activeFromWeekNumber?: number
  activeUntilWeekNumber?: number
  assignmentCount: number
}

export default function PhysiciansManagementPage() {
  const { fiscalYear } = useFiscalYear()
  const physicians = useQuery(
    api.functions.physicians.listPhysiciansWithStatus,
    fiscalYear ? { fiscalYearId: fiscalYear._id } : "skip"
  )
  const weeks = useQuery(
    api.functions.fiscalYears.getWeeksByFiscalYear,
    fiscalYear ? { fiscalYearId: fiscalYear._id } : "skip"
  )
  const createPhysician = useMutation(api.functions.physicians.createPhysician)
  const updatePhysician = useMutation(api.functions.physicians.updatePhysician)
  const deactivatePhysician = useMutation(api.functions.physicians.deactivatePhysician)

  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false)
  const [selectedPhysician, setSelectedPhysician] = useState<PhysicianWithStatus | null>(null)

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [initials, setInitials] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"physician" | "admin">("physician")
  const [activeFromWeekId, setActiveFromWeekId] = useState<string>("")
  const [activeUntilWeekId, setActiveUntilWeekId] = useState<string>("")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (physicians === undefined || weeks === undefined) {
    return (
      <>
        <PageHeader title="Physician Management" description="Manage physician profiles and mid-year changes" />
        <PageSkeleton />
      </>
    )
  }

  if (!fiscalYear) {
    return (
      <>
        <PageHeader title="Physician Management" description="Manage physician profiles and mid-year changes" />
        <EmptyState
          icon={Users}
          title="No active fiscal year"
          description="Create and activate a fiscal year first."
        />
      </>
    )
  }

  const handleAdd = async () => {
    setIsSaving(true)
    setError(null)
    try {
      await createPhysician({
        firstName,
        lastName,
        initials,
        email,
        role,
        activeFromWeekId: activeFromWeekId ? (activeFromWeekId as Id<"weeks">) : undefined,
      })
      setAddDialogOpen(false)
      resetForm()
      toast.success("Physician created successfully")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create physician"
      setError(message)
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!selectedPhysician) return
    setIsSaving(true)
    setError(null)
    try {
      await updatePhysician({
        physicianId: selectedPhysician._id,
        firstName,
        lastName,
        initials,
        email,
        role,
        activeFromWeekId: activeFromWeekId ? (activeFromWeekId as Id<"weeks">) : undefined,
        activeUntilWeekId: activeUntilWeekId ? (activeUntilWeekId as Id<"weeks">) : undefined,
      })
      setEditDialogOpen(false)
      resetForm()
      toast.success("Physician updated successfully")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update physician"
      setError(message)
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeactivate = async () => {
    if (!selectedPhysician || !activeUntilWeekId) return
    setIsSaving(true)
    setError(null)
    try {
      const result = await deactivatePhysician({
        physicianId: selectedPhysician._id,
        activeUntilWeekId: activeUntilWeekId as Id<"weeks">,
        fiscalYearId: fiscalYear._id,
      })
      setDeactivateDialogOpen(false)
      resetForm()
      toast.success(result.message)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to deactivate physician"
      setError(message)
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  const resetForm = () => {
    setFirstName("")
    setLastName("")
    setInitials("")
    setEmail("")
    setRole("physician")
    setActiveFromWeekId("")
    setActiveUntilWeekId("")
    setSelectedPhysician(null)
    setError(null)
  }

  const openEditDialog = (physician: PhysicianWithStatus) => {
    setSelectedPhysician(physician)
    setFirstName(physician.firstName)
    setLastName(physician.lastName)
    setInitials(physician.initials)
    setEmail(physician.email)
    setRole(physician.role)
    setActiveFromWeekId("")
    setActiveUntilWeekId("")
    setEditDialogOpen(true)
  }

  const openDeactivateDialog = (physician: PhysicianWithStatus) => {
    setSelectedPhysician(physician)
    setActiveUntilWeekId("")
    setDeactivateDialogOpen(true)
  }

  const getStatusBadge = (physician: PhysicianWithStatus) => {
    if (!physician.isActive) {
      return <Badge variant="secondary">Inactive</Badge>
    }
    if (physician.activeUntilWeekNumber !== undefined) {
      return <Badge variant="destructive">Ends Week {physician.activeUntilWeekNumber}</Badge>
    }
    if (physician.activeFromWeekNumber !== undefined) {
      return <Badge variant="default">Starts Week {physician.activeFromWeekNumber}</Badge>
    }
    return <Badge variant="default">Active</Badge>
  }

  const futureAssignments = selectedPhysician && activeUntilWeekId && weeks
    ? weeks.filter((w) => {
        const selectedWeek = weeks.find((week) => String(week._id) === activeUntilWeekId)
        return selectedWeek && w.weekNumber > selectedWeek.weekNumber
      }).length * (selectedPhysician.assignmentCount / weeks.length)
    : 0

  return (
    <>
      <PageHeader
        title="Physician Management"
        description={`${physicians.length} physician${physicians.length !== 1 ? 's' : ''} · ${fiscalYear.label}`}
        actions={
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" />
                Add Physician
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Physician</DialogTitle>
                <DialogDescription>
                  Create a new physician profile. Optionally set a start week for mid-year joins.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {error && (
                  <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="John"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Smith"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="initials">Initials</Label>
                      <Input
                        id="initials"
                        value={initials}
                        onChange={(e) => setInitials(e.target.value.toUpperCase())}
                        placeholder="JS"
                        maxLength={4}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role">Role</Label>
                      <Select value={role} onValueChange={(v) => setRole(v as "physician" | "admin")}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="physician">Physician</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="john.smith@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="activeFromWeek">Starts From Week (Optional)</Label>
                    <Select value={activeFromWeekId} onValueChange={setActiveFromWeekId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select week (leave blank for immediate start)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No restriction</SelectItem>
                        {weeks?.map((week) => (
                          <SelectItem key={week._id} value={String(week._id)}>
                            Week {week.weekNumber} ({week.startDate})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setAddDialogOpen(false); resetForm(); }}>
                  Cancel
                </Button>
                <Button onClick={handleAdd} disabled={isSaving || !firstName || !lastName || !initials || !email}>
                  {isSaving ? "Creating..." : "Create Physician"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="flex-1 space-y-6 p-4 md:p-6">
        {physicians.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No physicians"
            description="Add your first physician to get started."
          />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Initials</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assignments</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {physicians.map((physician) => (
                  <TableRow key={physician._id}>
                    <TableCell className="font-medium">
                      {physician.firstName} {physician.lastName}
                    </TableCell>
                    <TableCell>{physician.initials}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{physician.email}</TableCell>
                    <TableCell>
                      <Badge variant={physician.role === "admin" ? "default" : "outline"}>
                        {physician.role}
                      </Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(physician)}</TableCell>
                    <TableCell>{physician.assignmentCount}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditDialog(physician)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDeactivateDialog(physician)}
                          disabled={!physician.isActive || !!physician.activeUntilWeekNumber}
                        >
                          <UserX className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Physician</DialogTitle>
            <DialogDescription>
              Update physician details or set active date range for mid-year changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-firstName">First Name</Label>
                  <Input
                    id="edit-firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-lastName">Last Name</Label>
                  <Input
                    id="edit-lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-initials">Initials</Label>
                  <Input
                    id="edit-initials"
                    value={initials}
                    onChange={(e) => setInitials(e.target.value.toUpperCase())}
                    maxLength={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-role">Role</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as "physician" | "admin")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="physician">Physician</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-activeFromWeek">Starts From Week (Optional)</Label>
                <Select value={activeFromWeekId} onValueChange={setActiveFromWeekId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Current: No restriction" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No restriction</SelectItem>
                    {weeks?.map((week) => (
                      <SelectItem key={week._id} value={String(week._id)}>
                        Week {week.weekNumber} ({week.startDate})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-activeUntilWeek">Active Until Week (Optional)</Label>
                <Select value={activeUntilWeekId} onValueChange={setActiveUntilWeekId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Current: No end date" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No end date</SelectItem>
                    {weeks?.map((week) => (
                      <SelectItem key={week._id} value={String(week._id)}>
                        Week {week.weekNumber} ({week.startDate})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeUntilWeekId && weeks && (
                  <p className="text-sm text-amber-600 flex items-start gap-1.5">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      Setting an end week will clear all assignments after week{" "}
                      {weeks.find((w) => String(w._id) === activeUntilWeekId)?.weekNumber}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={isSaving || !firstName || !lastName || !initials || !email}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Dialog */}
      <Dialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Physician</DialogTitle>
            <DialogDescription>
              Set the last active week for {selectedPhysician?.initials}. All assignments after this week will be cleared.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <div className="rounded-md bg-muted p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Physician:</span>
                <span className="font-medium">
                  {selectedPhysician?.firstName} {selectedPhysician?.lastName} ({selectedPhysician?.initials})
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Current Assignments:</span>
                <span className="font-medium">{selectedPhysician?.assignmentCount ?? 0}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deactivate-activeUntilWeek">Active Until Week</Label>
              <Select value={activeUntilWeekId} onValueChange={setActiveUntilWeekId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select last active week" />
                </SelectTrigger>
                <SelectContent>
                  {weeks?.map((week) => (
                    <SelectItem key={week._id} value={String(week._id)}>
                      Week {week.weekNumber} ({week.startDate})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {activeUntilWeekId && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 p-4 text-sm text-amber-900 dark:text-amber-100 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Warning: This will clear future assignments</p>
                  <p className="text-xs mt-1">
                    Approximately {Math.round(futureAssignments)} assignment(s) will be cleared after week{" "}
                    {weeks.find(w => String(w._id) === activeUntilWeekId)?.weekNumber}.
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeactivateDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeactivate}
              disabled={isSaving || !activeUntilWeekId}
            >
              {isSaving ? "Deactivating..." : "Deactivate Physician"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
