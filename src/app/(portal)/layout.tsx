import { redirect } from "next/navigation";
import { PortalSidebar } from "@/components/portal/sidebar";
import { PageTransition } from "@/components/shared/page-transition";
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
      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 md:px-10 md:py-8">
        <div className="mx-auto max-w-6xl">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
    </div>
  );
}
