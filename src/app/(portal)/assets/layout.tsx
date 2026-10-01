import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { PageHeader } from "@/components/shared/page-header";
import { BrandIqSidebar } from "@/components/portal/brand-iq-sidebar";

export default async function AssetsLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getPortalViewer();
  const categories = await prisma.template.findMany({
    where: { OR: [{ clientId: viewer.clientId }, { clientId: null }] },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Brand IQ" />
      <div className="flex gap-6">
        <BrandIqSidebar templateCategories={categories.map((c) => c.category)} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
