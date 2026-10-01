import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/shared/page-header";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PersonAvatar } from "@/components/ui/avatar";
import { formatDate } from "@/lib/utils";
import { PLAN_TIER_LABEL } from "@/lib/labels";

const STATUS_TONE = { ACTIVE: "success", ONBOARDING: "info", PAUSED: "warning", OFFBOARDED: "neutral" } as const;

export default async function ClientsDirectoryPage() {
  const clients = await prisma.client.findMany({
    include: { accountLead: { include: { user: true } }, projects: { where: { status: { notIn: ["ARCHIVED", "DELIVERED"] } } } },
    orderBy: { name: "asc" },
  });

  return (
    <OpsPage>
      <div className="flex flex-col gap-6">
        <PageHeader title="Clients" addHref="/ops/clients/new" />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Health</TableHead>
              <TableHead>Account lead</TableHead>
              <TableHead>Renewal</TableHead>
              <TableHead>Active projects</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((c) => (
              <TableRow key={c.id} className="cursor-pointer">
                <TableCell className="font-medium">
                  <Link href={`/ops/clients/${c.id}/admin`} className="hover:underline">
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell>{PLAN_TIER_LABEL[c.planTier]}</TableCell>
                <TableCell>{c.healthScore}</TableCell>
                <TableCell>
                  {c.accountLead && (
                    <div className="flex items-center gap-2">
                      <PersonAvatar name={c.accountLead.user.name} size="sm" />
                      {c.accountLead.user.name}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{c.renewalDate && formatDate(c.renewalDate)}</TableCell>
                <TableCell>{c.projects.length}</TableCell>
                <TableCell>
                  <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </OpsPage>
  );
}
