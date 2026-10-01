import { requireOpsPage } from "@/lib/authz";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { getAgencyAttentionItems } from "@/lib/data/agency-attention";

export default async function OpsInboxPage() {
  await requireOpsPage(["ADMIN", "PM"]);
  const [attention, flaggedRuns] = await Promise.all([
    getAgencyAttentionItems(),
    prisma.agentRun.findMany({
      where: { status: { in: ["FLAGGED", "FAILED"] }, overridden: false },
      include: { agent: true, client: true, project: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <OpsPage>
      <div className="flex flex-col gap-6">
        <PageHeader title="Inbox" addHref="/ops/inbox" />

        <Card className="divide-y divide-border p-0">
          {flaggedRuns.map((r) => (
            <Link
              key={r.id}
              href={r.project ? `/ops/projects/${r.project.id}?feed=activity` : `/ops/agents/${r.agentId}`}
              className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-muted/50"
            >
              <div>
                <p className="text-sm font-medium">
                  {r.agent.name} {r.status === "FAILED" ? "failed" : "flagged something"}
                  {r.client && ` — ${r.client.name}`}
                  {r.project && ` · ${r.project.name}`}
                </p>
                <p className="text-sm text-muted-foreground">{r.decision ?? "No detail recorded."}</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-xs text-muted-foreground">{formatDate(r.createdAt, { day: "2-digit", month: "short" })}</p>
                <Badge tone={r.status === "FAILED" ? "danger" : "warning"}>{r.status}</Badge>
              </div>
            </Link>
          ))}
          {attention.map((item) => (
            <Link key={item.id} href={item.href} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-muted/50">
              <div>
                <p className="text-sm font-medium">
                  {item.clientName} — {item.title}
                </p>
                <p className="text-sm text-muted-foreground">{item.detail}</p>
              </div>
              <Badge tone={item.urgency === "high" ? "danger" : item.urgency === "medium" ? "warning" : "neutral"}>
                {item.urgency}
              </Badge>
            </Link>
          ))}
          {flaggedRuns.length === 0 && attention.length === 0 && (
            <p className="px-5 py-6 text-sm text-muted-foreground">Inbox zero — nothing needs your attention.</p>
          )}
        </Card>
      </div>
    </OpsPage>
  );
}
