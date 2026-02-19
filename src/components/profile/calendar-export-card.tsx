import Link from "next/link";
import { CalendarPrefsForm } from "@/components/profile/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/shared/components/ui/button";

export function CalendarExportCard({
  value,
  onChange,
  disabled,
  canUseDepartmentScope,
}: {
  value: CalendarPrefsForm;
  onChange: (next: CalendarPrefsForm) => void;
  disabled?: boolean;
  canUseDepartmentScope: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Calendar Export</CardTitle>
        <CardDescription>Set your default export behavior for calendar downloads.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs">Default Scope</Label>
          <Select
            value={value.defaultExportScope}
            onValueChange={(next) =>
              onChange({
                ...value,
                defaultExportScope: next as CalendarPrefsForm["defaultExportScope"],
              })
            }
            disabled={disabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select export scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="my">My calendar</SelectItem>
              {canUseDepartmentScope ? <SelectItem value="department">Department calendar</SelectItem> : null}
            </SelectContent>
          </Select>
          {!canUseDepartmentScope ? (
            <p className="text-xs text-muted-foreground">Department scope is available only for admin users.</p>
          ) : null}
        </div>

        <div className="flex items-start gap-3 rounded-md border p-3">
          <Checkbox
            id="calendar-include-events"
            checked={value.includeCalendarEvents}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange({
                ...value,
                includeCalendarEvents: checked === true,
              })
            }
          />
          <div className="space-y-1">
            <Label htmlFor="calendar-include-events" className="cursor-pointer">
              Include events in export
            </Label>
            <p className="text-xs text-muted-foreground">
              Include holidays, observances, and conferences in generated ICS files.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Default Format</Label>
          <Select value={value.defaultFormat} disabled>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ics">ICS (.ics)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Additional formats may be added in a future release.</p>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/calendar">Open Calendar Export</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
