import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/shared/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { PersonAvatar } from "@/components/ui/avatar";
import { TwoFactorCard } from "@/components/shared/two-factor-card";
import { getOpsViewer } from "@/lib/current-viewer";
import { INTERNAL_ROLE_LABEL } from "@/lib/labels";

export default async function OpsAccountPage() {
  const viewer = await getOpsViewer();

  return (
    <OpsPage>
      <div className="flex flex-col gap-6">
        <PageHeader title="Account" actions={<div />} />

        <div className="flex flex-col gap-3">
          <SectionLabel>Profile</SectionLabel>
          <Card className="flex items-center gap-4 p-5">
            <PersonAvatar name={viewer.user.name} size="lg" />
            <div>
              <p className="text-sm font-semibold">{viewer.user.name}</p>
              <p className="text-sm text-muted-foreground">{viewer.user.email}</p>
              <p className="text-xs text-muted-foreground">{INTERNAL_ROLE_LABEL[viewer.title]}</p>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Security</SectionLabel>
          <TwoFactorCard enabled={viewer.user.twoFactorEnabled} path="/ops/account" />
        </div>
      </div>
    </OpsPage>
  );
}
