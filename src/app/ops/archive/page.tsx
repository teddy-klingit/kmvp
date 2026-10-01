import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/shared/page-header";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

export default async function CrossClientArchivePage() {
  const projects = await prisma.project.findMany({
    where: { status: { in: ["ARCHIVED", "DELIVERED"] } },
    include: { client: true, assets: true },
    orderBy: { deliveredAt: "desc" },
  });

  return (
    <OpsPage>
      <div className="flex flex-col gap-6">
        <PageHeader title="Archive" addHref="/ops/archive" />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Assets</TableHead>
              <TableHead>Delivered</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <Link href={`/ops/clients/${p.clientId}/dashboard`} className="hover:underline">
                    {p.client.name}
                  </Link>
                </TableCell>
                <TableCell>{p.name}</TableCell>
                <TableCell>{p.assets.length}</TableCell>
                <TableCell className="text-muted-foreground">{p.deliveredAt && formatDate(p.deliveredAt)}</TableCell>
                <TableCell>
                  {p.priceCurrency} {p.priceAmount?.toLocaleString() ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </OpsPage>
  );
}
