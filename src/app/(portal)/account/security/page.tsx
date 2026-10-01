import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card, SectionLabel } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TwoFactorCard } from "@/components/shared/two-factor-card";
import { updateNotificationPrefsAction, connectSlackAction } from "@/lib/actions/notification-pref-actions";

export default async function AccountSecurityPage() {
  const viewer = await getPortalViewer();
  const prefs = await prisma.notificationPreference.findUnique({ where: { userId: viewer.userId } });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <SectionLabel>Two-factor authentication</SectionLabel>
        <TwoFactorCard enabled={viewer.user.twoFactorEnabled} path="/account/security" />
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel>Notification preferences</SectionLabel>
        <Card className="p-5">
          <form action={updateNotificationPrefsAction} className="flex flex-col gap-4">
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox name="emailEnabled" defaultChecked={prefs?.emailEnabled ?? true} />
              Email notifications
            </label>
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox name="inAppEnabled" defaultChecked={prefs?.inAppEnabled ?? true} />
              In-app notifications
            </label>
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox name="slackEnabled" defaultChecked={prefs?.slackEnabled ?? false} />
              Slack notifications
            </label>
            <div className="flex flex-col gap-1.5">
              <Label>Frequency</Label>
              <select
                name="frequency"
                defaultValue={prefs?.frequency ?? "INSTANT"}
                className="h-9 w-48 rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="INSTANT">Instant</option>
                <option value="DAILY_DIGEST">Daily digest</option>
                <option value="WEEKLY">Weekly</option>
              </select>
            </div>
            <Button type="submit" className="self-start">
              Save preferences
            </Button>
          </form>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel>Slack workspace</SectionLabel>
        <Card className="p-5">
          {prefs?.slackWorkspace ? (
            <p className="text-sm text-muted-foreground">
              Connected to <span className="font-medium text-foreground">{prefs.slackWorkspace}</span>.
            </p>
          ) : (
            <form action={connectSlackAction} className="flex gap-2">
              <Input name="slackWorkspace" placeholder="your-workspace.slack.com" className="max-w-xs" />
              <Button type="submit" variant="secondary">
                Connect
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
