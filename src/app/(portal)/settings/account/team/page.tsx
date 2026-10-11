import { getPortalViewer } from "@/lib/current-viewer";
import { PageGrid } from "@/components/ds/page-grid";
import { SectionCard } from "@/components/ds/card";
import { InviteTeammateForm } from "@/components/portal/invite-teammate-form";
import { TeamRows } from "@/components/portal/team-rows";

/** Account → Team: everyone on the client's team, and inviting someone new. */
export default async function AccountTeamPage() {
  const viewer = await getPortalViewer();
  return (
    <PageGrid
      main={
        <SectionCard title="Team">
          <TeamRows clientId={viewer.clientId} viewer={viewer} manage />
        </SectionCard>
      }
      side={
        <SectionCard id="invite" title="Invite a teammate">
          <div className="px-6 py-5">
            <InviteTeammateForm />
          </div>
        </SectionCard>
      }
    />
  );
}
