import { redirect } from "next/navigation";
import { PortalSidebar } from "@/components/portal/sidebar";
import { PortalMain } from "@/components/portal/portal-main";
import { getPortalViewer } from "@/lib/current-viewer";
import { prisma } from "@/lib/prisma";
import { loadNavSummary } from "@/lib/nav-summary";
import { clientRoleLabel, isClientAdmin } from "@/lib/client-roles";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getPortalViewer();
  if (!viewer.client.onboardingCompletedAt) redirect("/onboarding");

  const [brands, unreadCount, summary] = await Promise.all([
    prisma.brand.findMany({ where: { clientId: viewer.clientId }, orderBy: { isPrimary: "desc" } }),
    prisma.notification.count({ where: { userId: viewer.userId, read: false, archivedAt: null } }),
    loadNavSummary(viewer),
  ]);

  return (
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
  );
}
