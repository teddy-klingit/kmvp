import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { Card, SectionLabel } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { PLAN_TIER_LABEL } from "@/lib/labels";
import { StageBadge } from "@/components/portal/stage-badge";
import { loadProjectStateMap } from "@/lib/project-state-loader";

export default async function AccountOverviewPage() {
  const viewer = await getPortalViewer();
  const client = await prisma.client.findUniqueOrThrow({
    where: { id: viewer.clientId },
    include: { brandOS: true },
  });

  const [projects, projectCountThisYear] = await Promise.all([
    prisma.project.findMany({
      where: { clientId: client.id, ...projectVisibilityWhere(viewer.id) },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { assets: true },
    }),
    prisma.project.count({ where: { clientId: client.id, ...projectVisibilityWhere(viewer.id) } }),
  ]);

  const stateById = await loadProjectStateMap(projects.map((p) => p.id), client.id);
  const used = client.monthlyCreditAllowance - client.creditBalance;
  const usedPct = client.monthlyCreditAllowance > 0 ? Math.round((used / client.monthlyCreditAllowance) * 100) : 0;
  const assetsInArchive = await prisma.asset.count({ where: { clientId: client.id } });

  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-2 text-sm text-muted-foreground">
        {PLAN_TIER_LABEL[client.planTier]} · {client.monthlyCreditAllowance}c/mo
        {client.renewalDate && ` · Renews ${formatDate(client.renewalDate)}`}
      </p>

      <div className="flex flex-col gap-3">
        <SectionLabel>Credits this month</SectionLabel>
        <Card className="p-5">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-light">{used}c</span>
            <span className="text-sm text-muted-foreground">of {client.monthlyCreditAllowance}c used</span>
          </div>
          <Progress value={usedPct} className="mt-3" />
          <p className="mt-2 text-xs text-muted-foreground">{client.creditBalance}c remaining</p>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="border border-border bg-paper p-4">
          <p className="font-display text-xl font-light">{projectCountThisYear}</p>
          <p className="text-xs text-muted-foreground">Projects this year</p>
        </Card>
        <Card className="border border-border bg-paper p-4">
          <p className="font-display text-xl font-light">{assetsInArchive}</p>
          <p className="text-xs text-muted-foreground">Assets in archive</p>
        </Card>
        <Card className="border border-border bg-paper p-4">
          <p className="font-display text-xl font-light">{client.brandOS?.foundationPct ?? 0}%</p>
          <p className="text-xs text-muted-foreground">Brand maturity</p>
        </Card>
        <Card className="border border-border bg-paper p-4">
          <p className="font-display text-xl font-light">{client.healthScore}</p>
          <p className="text-xs text-muted-foreground">Account health</p>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel>Recent projects</SectionLabel>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assets</TableHead>
              <TableHead>Delivered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>
                  {stateById.get(p.id) && <StageBadge state={stateById.get(p.id)!} />}
                </TableCell>
                <TableCell>{p.assets.length}</TableCell>
                <TableCell className="text-muted-foreground">
                  {p.deliveredAt ? formatDate(p.deliveredAt) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
