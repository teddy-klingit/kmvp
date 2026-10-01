import { redirect } from "next/navigation";
import { PortalSidebar } from "@/components/portal/sidebar";
import { PortalMain } from "@/components/portal/portal-main";
import { getPortalViewer } from "@/lib/current-viewer";
import { prisma } from "@/lib/prisma";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getPortalViewer();
  if (!viewer.client.onboardingCompletedAt) redirect("/onboarding");

  const [brands, unreadCount] = await Promise.all([
    prisma.brand.findMany({ where: { clientId: viewer.clientId }, orderBy: { isPrimary: "desc" } }),
    prisma.notification.count({ where: { userId: viewer.userId, read: false, archivedAt: null } }),
  ]);

  return (
    <div className="flex h-screen w-full bg-background">
      <PortalSidebar
        userName={viewer.user.name}
        userEmail={viewer.user.email}
        clientName={viewer.client.name}
        brands={brands.map((b) => ({ id: b.id, name: b.name }))}
        unreadCount={unreadCount}
      />
      <PortalMain>{children}</PortalMain>
    </div>
  );
}
