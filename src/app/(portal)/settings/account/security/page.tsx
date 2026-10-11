import { getPortalViewer } from "@/lib/current-viewer";
import { SectionCard } from "@/components/ds/card";
import { TwoFactorCard } from "@/components/shared/two-factor-card";

export default async function AccountSecurityPage() {
  const viewer = await getPortalViewer();

  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <SectionCard title="Two-factor authentication">
        <TwoFactorCard enabled={viewer.user.twoFactorEnabled} path="/settings/account/security" />
      </SectionCard>

    </div>
  );
}
