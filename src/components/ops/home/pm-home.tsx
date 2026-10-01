import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/shared/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { getAgencyAttentionItems } from "@/lib/data/agency-attention";
import type { StaffMember, User } from "@/generated/prisma";

const URGENCY_TONE = { high: "danger", medium: "warning", low: "neutral" } as const;

export async function PmHome({ viewer }: { viewer: StaffMember & { user: User } }) {
  const [attention, clients] = await Promise.all([
    getAgencyAttentionItems(viewer.id),
    prisma.client.findMany({
      where: { accountLeadId: viewer.id },
      include: { projects: { where: { status: { notIn: ["ARCHIVED", "DELIVERED"] } }, orderBy: { dueDate: "asc" } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const activeProjectCount = clients.reduce((sum, c) => sum + c.projects.length, 0);
  const nextDeadline = clients
    .flatMap((c) => c.projects)
    .filter((p) => p.dueDate)
    .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())[0];
  const atRiskClients = clients.filter((c) => c.healthScore < 75);

  return (
    <OpsPage>
      <div className="flex flex-col gap-8">
        <PageHeader title={`Good morning, ${viewer.user.name.split(" ")[0]}.`} addHref="/ops/projects/new" />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="border border-border bg-paper p-4">
            <p className="font-display text-2xl font-light">{clients.length}</p>
            <p className="text-xs text-muted-foreground">My accounts</p>
          </Card>
          <Card className="border border-border bg-paper p-4">
            <p className="font-display text-2xl font-light">{activeProjectCount}</p>
            <p className="text-xs text-muted-foreground">Active projects</p>
          </Card>
          <Card className="border border-border bg-paper p-4">
            <p className="font-display text-2xl font-light">{nextDeadline ? formatDate(nextDeadline.dueDate!) : "—"}</p>
            <p className="text-xs text-muted-foreground">Next deadline</p>
          </Card>
          <Card className="border border-border bg-paper p-4">
            <p className="font-display text-2xl font-light text-ink">{atRiskClients.length}</p>
            <p className="text-xs text-muted-foreground">Accounts at risk</p>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Needs your attention</SectionLabel>
          {attention.length === 0 ? (
            <Card className="p-6">
              <p className="text-sm text-muted-foreground">Nothing urgent across your accounts right now.</p>
            </Card>
          ) : (
            <Card className="divide-y divide-border p-0">
              {attention.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-muted/50"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {item.clientName} · {item.projectName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {item.title} — {item.detail}
                    </p>
                  </div>
                  <Badge tone={URGENCY_TONE[item.urgency]}>{item.urgency}</Badge>
                </Link>
              ))}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>My accounts</SectionLabel>
          {clients.length === 0 ? (
            <Card className="p-6">
              <p className="text-sm text-muted-foreground">No accounts assigned to you yet.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {clients.map((c) => (
                <Link key={c.id} href={`/ops/clients/${c.id}/dashboard`}>
                  <Card className="flex flex-col gap-2 p-5 transition-colors hover:border-ink/30">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{c.name}</p>
                      <Badge tone={c.healthScore < 75 ? "warning" : "success"}>Health {c.healthScore}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {c.projects.length} active project{c.projects.length === 1 ? "" : "s"}
                      {c.projects[0]?.dueDate && ` · next due ${formatDate(c.projects[0].dueDate)}`}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </OpsPage>
  );
}
