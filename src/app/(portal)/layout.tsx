import { redirect } from "next/navigation";
import { PortalSidebar } from "@/components/portal/sidebar";
import { PortalMain } from "@/components/portal/portal-main";
import { getPortalViewer } from "@/lib/current-viewer";
import { prisma } from "@/lib/prisma";
import { loadNavSummary } from "@/lib/nav-summary";
import { clientRoleLabel, isClientAdmin } from "@/lib/client-roles";
import { PmPanelProvider } from "@/components/pm-panel/pm-panel-provider";
import { pmUnread } from "@/lib/pm-thread";
import { StaffTagsProvider } from "@/components/ds/placeholder-tag";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getPortalViewer();
  if (!viewer.client.onboardingCompletedAt) redirect("/onboarding");

  const [brands, unreadCount, summary, pmUnreadCount] = await Promise.all([
    prisma.brand.findMany({ where: { clientId: viewer.clientId }, orderBy: { isPrimary: "desc" } }),
    prisma.notification.count({ where: { userId: viewer.userId, read: false, archivedAt: null } }),
    loadNavSummary(viewer),
    pmUnread(viewer.clientId, viewer.userId, "client"),
  ]);

  // Phase W: no Placeholder tags anywhere on the client side.
  return (
    <StaffTagsProvider show={false}>
    <PmPanelProvider side="client" unread={pmUnreadCount}>
    <div className="flex h-screen w-full flex-col bg-brand-page min-[900px]:flex-row">
      <PortalSidebar
        userId={viewer.userId}
        userName={viewer.user.name}
        userEmail={viewer.user.email}
        clientName={viewer.client.name}
        role={clientRoleLabel(viewer)}
        admin={isClientAdmin(viewer)}
        summary={summary}
        brands={brands.map((b) => ({ id: b.id, name: b.name }))}
        unreadCount={unreadCount}
      />
      <PortalMain>{children}</PortalMain>
    </div>
    </PmPanelProvider>
    </StaffTagsProvider>
  );
}
