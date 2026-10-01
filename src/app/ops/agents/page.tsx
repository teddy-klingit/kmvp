import { requireOpsPage } from "@/lib/authz";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/shared/page-header";
import { NavTabs } from "@/components/ui/nav-tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AGENT_CATEGORY_LABEL } from "@/lib/labels";

const STATUS_TONE = { LIVE: "success", SANDBOX: "warning", DISABLED: "neutral", ERROR: "danger" } as const;

export default async function AgentsLibraryPage() {
  await requireOpsPage(["ADMIN"]);
  const agents = await prisma.agent.findMany({
    include: { runs: true },
    orderBy: { category: "asc" },
  });

  return (
    <OpsPage>
      <div className="flex flex-col gap-6">
        <PageHeader title="Agents" addHref="/ops/agents" />
        <NavTabs items={[{ label: "Library", href: "/ops/agents" }, { label: "Decision log", href: "/ops/agents/audit" }]} />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Self-service</TableHead>
              <TableHead>Runs</TableHead>
              <TableHead>Flagged</TableHead>
              <TableHead>Version</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">
                  <Link href={`/ops/agents/${a.id}`} className="hover:underline">
                    {a.name}
                  </Link>
                  <p className="text-xs font-normal text-muted-foreground">{a.description}</p>
                </TableCell>
                <TableCell>{AGENT_CATEGORY_LABEL[a.category]}</TableCell>
                <TableCell>
                  <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
                </TableCell>
                <TableCell>{a.selfService ? <Badge tone="accent">Self-service</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>{a.runs.length}</TableCell>
                <TableCell>{a.runs.filter((r) => r.status === "FLAGGED" || r.status === "FAILED").length}</TableCell>
                <TableCell className="text-muted-foreground">{a.version}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </OpsPage>
  );
}
