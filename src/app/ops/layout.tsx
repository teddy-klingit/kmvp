import { OpsSidebar } from "@/components/ops/sidebar";
import { PageTransition } from "@/components/shared/page-transition";
import { getOpsViewer } from "@/lib/current-viewer";
import { INTERNAL_ROLE_LABEL } from "@/lib/labels";
import { roleTierFor } from "@/lib/role-tier";

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getOpsViewer();
  const tier = roleTierFor(viewer.title);

  return (
    <div className="flex h-screen w-full bg-background">
      <OpsSidebar
        userName={viewer.user.name}
        userTitle={INTERNAL_ROLE_LABEL[viewer.title]}
        userEmail={viewer.user.email}
        tier={tier}
      />
      <main className="flex-1 overflow-y-auto">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
