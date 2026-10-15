import { OpsSidebar } from "@/components/ops/sidebar";
import { PageTransition } from "@/components/shared/page-transition";
import { getOpsViewer } from "@/lib/current-viewer";
import { INTERNAL_ROLE_LABEL } from "@/lib/labels";
import { hasAdmin, roleTierFor } from "@/lib/role-tier";
import { adminJobCounts } from "@/lib/admin-jobs";
import { loadToday } from "@/lib/today";
import { scopeFor } from "@/lib/staff-scope";

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getOpsViewer();
  const tier = roleTierFor(viewer.title);
  // Today: my open tasks (Today's default view). Admin: open set-up jobs (Phase T).
  const needsCount = tier === "CREATOR" ? 0 : (await loadToday(await scopeFor(viewer), new Date(), viewer)).tasks.length;
  const admin = hasAdmin(viewer);
  const adminCount = admin ? (await adminJobCounts()).jobs : 0;

  return (
    <div className="flex h-screen w-full flex-col bg-brand-page min-[900px]:flex-row">
      <OpsSidebar
        userId={viewer.userId}
        userName={viewer.user.name}
        userTitle={tier === "PM" ? "Marketing PM" : INTERNAL_ROLE_LABEL[viewer.title]}
        userEmail={viewer.user.email}
        tier={tier}
        needsCount={needsCount}
        admin={admin}
        adminCount={adminCount}
      />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
