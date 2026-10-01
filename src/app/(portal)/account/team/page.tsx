import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card, SectionLabel } from "@/components/ui/card";
import { PersonAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InviteTeammateForm } from "@/components/portal/invite-teammate-form";
import { removeTeammateAction } from "@/lib/actions/team-actions";
import { CLIENT_PERMISSION_LABEL } from "@/lib/labels";

export default async function AccountTeamPage() {
  const viewer = await getPortalViewer();
  const teammates = await prisma.clientUser.findMany({
    where: { clientId: viewer.clientId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <SectionLabel>Invite a teammate</SectionLabel>
        <Card className="p-5">
          <InviteTeammateForm />
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel>Team members</SectionLabel>
        <Card className="divide-y divide-border p-0">
          {teammates.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div className="flex items-center gap-3">
                <PersonAvatar name={t.user.name} />
                <div>
                  <p className="text-sm font-medium">{t.user.name}</p>
                  <p className="text-xs text-muted-foreground">{t.jobTitle ?? t.user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={t.user.status === "INVITED" ? "warning" : "neutral"}>
                  {t.user.status === "INVITED" ? "Invited" : CLIENT_PERMISSION_LABEL[t.permission]}
                </Badge>
                {viewer.permission === "OWNER" && t.id !== viewer.id && (
                  <form action={removeTeammateAction}>
                    <input type="hidden" name="clientUserId" value={t.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      Remove
                    </Button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
