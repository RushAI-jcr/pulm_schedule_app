import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NotificationPrefsForm } from "@/components/profile/types";

type NotificationToggle = {
  key: keyof NotificationPrefsForm;
  label: string;
  description: string;
};

const toggles: NotificationToggle[] = [
  {
    key: "schedulePublishedEmail",
    label: "Schedule published emails",
    description: "Email me when the fiscal year schedule is published.",
  },
  {
    key: "tradeRequestEmail",
    label: "Trade request emails",
    description: "Email me when I receive a new trade request.",
  },
  {
    key: "tradeStatusEmail",
    label: "Trade status emails",
    description: "Email me when my trade request is approved, denied, or updated.",
  },
  {
    key: "requestWindowEmail",
    label: "Request window reminder emails",
    description: "Email me when preference collection windows open and close.",
  },
  {
    key: "inAppEnabled",
    label: "In-app notifications",
    description: "Enable in-app notification tracking for future notification center features.",
  },
];

export function NotificationPreferencesCard({
  value,
  onChange,
  disabled,
}: {
  value: NotificationPrefsForm;
  onChange: (next: NotificationPrefsForm) => void;
  disabled?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
        <CardDescription>Control how this account receives scheduling updates.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {toggles.map((toggle) => {
          const id = `notification-${toggle.key}`;
          return (
            <div key={toggle.key} className="flex items-start gap-3 rounded-md border p-3">
              <Checkbox
                id={id}
                checked={value[toggle.key]}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onChange({
                    ...value,
                    [toggle.key]: checked === true,
                  })
                }
              />
              <div className="space-y-1">
                <Label htmlFor={id} className="cursor-pointer">
                  {toggle.label}
                </Label>
                <p className="text-xs text-muted-foreground">{toggle.description}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
