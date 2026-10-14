import { OpsSidebar } from "@/components/ops/sidebar";
import { PageTransition } from "@/components/shared/page-transition";
import { getOpsViewer } from "@/lib/current-viewer";
import { INTERNAL_ROLE_LABEL } from "@/lib/labels";
import { roleTierFor } from "@/lib/role-tier";
import { prisma } from "@/lib/prisma";
import { loadToday } from "@/lib/today";
import { scopeFor } from "@/lib/staff-scope";
import { unassignedLiveAdAccounts } from "@/lib/integrations/live-ads-owner";

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getOpsViewer();
  const tier = roleTierFor(viewer.title);
  // Same count as Today in its default view (a PM's own clients, everything for an admin), plus ad accounts nobody owns.
  const needsCount = tier === "CREATOR" ? 0 : (await loadToday(await scopeFor(viewer))).items.length + (await unassignedLiveAdAccounts()).length;
  const requestsCount = tier === "CREATOR" ? 0 : await prisma.purchaseRequest.count({ where: { status: "pending" } });

  return (
    <div className="flex h-screen w-full flex-col bg-brand-page min-[900px]:flex-row">
      <OpsSidebar
        userId={viewer.userId}
        userName={viewer.user.name}
        userTitle={INTERNAL_ROLE_LABEL[viewer.title]}
        userEmail={viewer.user.email}
        tier={tier}
        needsCount={needsCount}
        requestsCount={requestsCount}
      />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
