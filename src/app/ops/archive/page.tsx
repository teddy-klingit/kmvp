import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { FilterChips } from "@/components/ds/filter-chips";
import { SectionCard, CardNote } from "@/components/ds/card";
import { DataTable } from "@/components/ds/data-table";
import { StatusPill } from "@/components/ds/status-pill";

/** Ops → Archive (OpsClients pattern): delivered and archived projects across clients, newest first. */
export default async function CrossClientArchivePage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  const projects = await prisma.project.findMany({
    where: { status: { in: ["ARCHIVED", "DELIVERED"] } },
    include: { client: true, _count: { select: { assets: true } } },
    orderBy: [{ deliveredAt: "desc" }, { updatedAt: "desc" }],
  });
  const delivered = projects.filter((p) => p.status === "DELIVERED");
  const archived = projects.filter((p) => p.status === "ARCHIVED");
  const visible = show === "delivered" ? delivered : show === "archived" ? archived : projects;

  return (
    <OpsPage>
      <PageHeader eyebrow={`${delivered.length} delivered · ${archived.length} archived`} title="Archive" />
      <FilterChips
        label="Filter archive"
        items={[
          { label: "All", href: "/ops/archive", active: !show },
          { label: "Delivered", href: "/ops/archive?show=delivered", active: show === "delivered", count: delivered.length },
          { label: "Archived", href: "/ops/archive?show=archived", active: show === "archived", count: archived.length },
        ]}
      />
      <SectionCard title="Projects">
        <DataTable
          label="Archived projects"
          empty={<CardNote>Nothing here yet.</CardNote>}
          columns={[
            { key: "project", label: "Project" },
            { key: "client", label: "Client" },
            { key: "assets", label: "Assets", align: "right" },
            { key: "delivered", label: "Delivered" },
            { key: "value", label: "Value", align: "right" },
            { key: "status", label: "Status" },
          ]}
          rows={visible.map((p) => ({
            id: p.id,
            href: `/ops/projects/${p.id}`,
            cells: {
              project: <span className="text-[15px]">{p.name}</span>,
              client: p.client.name,
              assets: p._count.assets,
              delivered: p.deliveredAt ? formatDate(p.deliveredAt, { day: "numeric", month: "short", year: "numeric" }) : null,
              value: p.priceAmount !== null ? `${p.priceCurrency} ${p.priceAmount.toLocaleString("en-GB")}` : null,
              status: <StatusPill tone={p.status === "DELIVERED" ? "success" : "neutral"}>{p.status === "DELIVERED" ? "Delivered" : "Archived"}</StatusPill>,
            },
          }))}
        />
      </SectionCard>
    </OpsPage>
  );
}
