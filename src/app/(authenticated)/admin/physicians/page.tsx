"use client"

import { useState } from "react"
import { useQuery, useMutation } from "convex/react"
import { Users, Plus, Pencil, UserX, AlertCircle, Trash2 } from "lucide-react"
import { api } from "../../../../../convex/_generated/api"
import type { Id } from "../../../../../convex/_generated/dataModel"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { PageSkeleton } from "@/components/shared/loading-skeleton"
import { Button } from "@/shared/components/ui/button"
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
  activeFromDate?: string
  activeUntilDate?: string
  assignmentCount: number
}

type PhysicianEmailAlias = {
  aliasId: Id<"physicianEmailAliases"> | null
  physicianId: Id<"physicians">
  email: string
  isVerified: boolean
  source: "canonical" | "admin" | "auto_name_link" | "self_email_link" | "backfill"
  isCanonical: boolean
  createdAt: number
  createdByWorkosUserId: string | null
}

export default function PhysiciansManagementPage() {
  const { fiscalYear } = useFiscalYear()
  const physicians = useQuery(
    api.functions.physicians.listPhysiciansWithStatus,
    fiscalYear ? { fiscalYearId: fiscalYear._id } : "skip"
  )
  const createPhysician = useMutation(api.functions.physicians.createPhysician)
  const updatePhysician = useMutation(api.functions.physicians.updatePhysician)
  const deactivatePhysician = useMutation(api.functions.physicians.deactivatePhysician)
  const addPhysicianEmailAlias = useMutation(api.functions.physicians.addPhysicianEmailAlias)
  const removePhysicianEmailAlias = useMutation(api.functions.physicians.removePhysicianEmailAlias)

  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false)
  const [selectedPhysician, setSelectedPhysician] = useState<PhysicianWithStatus | null>(null)

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [initials, setInitials] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"physician" | "admin">("physician")
  const [activeFromDate, setActiveFromDate] = useState("")
  const [activeUntilDate, setActiveUntilDate] = useState("")
  const [newAliasEmail, setNewAliasEmail] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingAlias, setIsSavingAlias] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const physicianAliases = useQuery(
    api.functions.physicians.listPhysicianEmailAliases,
    selectedPhysician ? { physicianId: selectedPhysician._id } : "skip"
  ) as PhysicianEmailAlias[] | undefined

  if (physicians === undefined) {
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
        activeFromDate: activeFromDate || undefined,
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
        // Pass date strings — empty string means "clear the restriction"
        activeFromDate,
        activeUntilDate,
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
    if (!selectedPhysician || !activeUntilDate) return
    setIsSaving(true)
    setError(null)
    try {
      const result = await deactivatePhysician({
        physicianId: selectedPhysician._id,
        activeUntilDate,
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

  const handleAddAlias = async () => {
    if (!selectedPhysician || !newAliasEmail) return
    setIsSavingAlias(true)
    setError(null)
    try {
      await addPhysicianEmailAlias({
        physicianId: selectedPhysician._id,
        email: newAliasEmail,
      })
      setNewAliasEmail("")
      toast.success("Email alias added")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add email alias"
      setError(message)
      toast.error(message)
    } finally {
      setIsSavingAlias(false)
    }
  }

  const handleRemoveAlias = async (aliasId: Id<"physicianEmailAliases">) => {
    setIsSavingAlias(true)
    setError(null)
    try {
      await removePhysicianEmailAlias({ aliasId })
      toast.success("Email alias removed")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove email alias"
      setError(message)
      toast.error(message)
    } finally {
      setIsSavingAlias(false)
    }
  }

  const resetForm = () => {
    setFirstName("")
    setLastName("")
    setInitials("")
    setEmail("")
    setRole("physician")
    setActiveFromDate("")
    setActiveUntilDate("")
    setNewAliasEmail("")
    setIsSavingAlias(false)
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
    // Pre-populate with existing dates so saving without changes doesn't lose data
    setActiveFromDate(physician.activeFromDate ?? "")
    setActiveUntilDate(physician.activeUntilDate ?? "")
    setNewAliasEmail("")
    setEditDialogOpen(true)
  }

  const openDeactivateDialog = (physician: PhysicianWithStatus) => {
    setSelectedPhysician(physician)
    setActiveUntilDate(physician.activeUntilDate ?? "")
    setDeactivateDialogOpen(true)
  }

  const formatDate = (isoDate: string) => {
    const [year, month, day] = isoDate.split("-").map(Number)
    return new Date(year, month - 1, day).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const getStatusBadge = (physician: PhysicianWithStatus) => {
    if (!physician.isActive) {
      return <Badge variant="secondary">Inactive</Badge>
    }
    if (physician.activeUntilDate) {
      return <Badge variant="destructive">Until {formatDate(physician.activeUntilDate)}</Badge>
    }
    if (physician.activeFromDate) {
      return <Badge variant="default">Starts {formatDate(physician.activeFromDate)}</Badge>
    }
    return <Badge variant="default">Active</Badge>
  }

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
                  Create a new physician profile. Optionally set a start date for mid-year joins.
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
                      <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="initials">Initials</Label>
                      <Input id="initials" value={initials} onChange={(e) => setInitials(e.target.value.toUpperCase())} placeholder="JS" maxLength={4} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role">Role</Label>
                      <Select value={role} onValueChange={(v) => setRole(v as "physician" | "admin")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="physician">Physician</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john.smith@rush.edu" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="activeFromDate">Active From Date (Optional)</Label>
                    <Input id="activeFromDate" type="date" value={activeFromDate} onChange={(e) => setActiveFromDate(e.target.value)} />
                    <p className="text-xs text-muted-foreground">Leave blank for immediate start from the beginning of the fiscal year.</p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setAddDialogOpen(false); resetForm(); }}>Cancel</Button>
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
          <EmptyState icon={Users} title="No physicians" description="Add your first physician to get started." />
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
                    <TableCell className="font-medium">{physician.firstName} {physician.lastName}</TableCell>
                    <TableCell>{physician.initials}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{physician.email}</TableCell>
                    <TableCell>
                      <Badge variant={physician.role === "admin" ? "default" : "outline"}>{physician.role}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(physician)}</TableCell>
                    <TableCell>{physician.assignmentCount}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(physician)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDeactivateDialog(physician)}
                          disabled={!physician.isActive || !!physician.activeUntilDate}
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
                  <Input id="edit-firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-lastName">Last Name</Label>
                  <Input id="edit-lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-initials">Initials</Label>
                  <Input id="edit-initials" value={initials} onChange={(e) => setInitials(e.target.value.toUpperCase())} maxLength={4} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-role">Role</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as "physician" | "admin")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="physician">Physician</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <p className="text-xs text-muted-foreground">Canonical physician email</p>
              </div>
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label>Email aliases</Label>
                  <Badge variant="outline">Sign-in aliases</Badge>
                </div>
                {physicianAliases === undefined ? (
                  <p className="text-xs text-muted-foreground">Loading aliases...</p>
                ) : physicianAliases.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No aliases configured.</p>
                ) : (
                  <div className="space-y-2">
                    {physicianAliases.map((alias) => (
                      <div key={alias.aliasId ?? `canonical-${alias.email}`} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm">{alias.email}</p>
                          <div className="mt-1 flex items-center gap-1">
                            {alias.isCanonical && <Badge variant="secondary">Canonical</Badge>}
                            {alias.isVerified && <Badge variant="outline">Verified</Badge>}
                            <Badge variant="outline">{alias.source.replaceAll("_", " ")}</Badge>
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => alias.aliasId && handleRemoveAlias(alias.aliasId)}
                          disabled={!alias.aliasId || alias.isCanonical || isSavingAlias}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="name@gmail.com"
                    type="email"
                    value={newAliasEmail}
                    onChange={(e) => setNewAliasEmail(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddAlias}
                    disabled={isSavingAlias || !newAliasEmail || !selectedPhysician}
                  >
                    Add
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-activeFromDate">Active From Date</Label>
                  <Input id="edit-activeFromDate" type="date" value={activeFromDate} onChange={(e) => setActiveFromDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-activeUntilDate">Active Until Date</Label>
                  <Input id="edit-activeUntilDate" type="date" value={activeUntilDate} onChange={(e) => setActiveUntilDate(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Clear a date field to remove that restriction.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditDialogOpen(false); resetForm(); }}>Cancel</Button>
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
              Set the last active date for {selectedPhysician?.initials}. All assignments after this date will be cleared.
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
              <Label htmlFor="deactivate-date">Last Active Date</Label>
              <Input
                id="deactivate-date"
                type="date"
                value={activeUntilDate}
                onChange={(e) => setActiveUntilDate(e.target.value)}
              />
            </div>
            {activeUntilDate && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 p-4 text-sm text-amber-900 dark:text-amber-100 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Warning: This will clear future assignments</p>
                  <p className="text-xs mt-1">
                    All of {selectedPhysician?.initials}&apos;s assignments in weeks starting after {activeUntilDate ? formatDate(activeUntilDate) : ""} will be cleared from the draft calendar.
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeactivateDialogOpen(false); resetForm(); }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDeactivate}
              disabled={isSaving || !activeUntilDate}
            >
              {isSaving ? "Deactivating..." : "Deactivate Physician"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
