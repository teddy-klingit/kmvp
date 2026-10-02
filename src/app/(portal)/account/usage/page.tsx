import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { SectionCard } from "@/components/ds/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

export default async function AccountUsagePage() {
  const viewer = await getPortalViewer();

  const [entries, projects] = await Promise.all([
    prisma.creditLedgerEntry.findMany({
      where: { clientId: viewer.clientId },
      orderBy: { createdAt: "desc" },
      include: { project: true },
    }),
    prisma.project.findMany({
      where: { clientId: viewer.clientId, creditsQuoted: { not: null }, ...projectVisibilityWhere(viewer.id) },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const byMonth = new Map<string, number>();
  for (const e of entries) {
    const key = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(e.createdAt);
    byMonth.set(key, (byMonth.get(key) ?? 0) + e.amount);
  }
  const months = Array.from(byMonth.entries()).reverse();
  const maxAbs = Math.max(1, ...months.map(([, v]) => Math.abs(v)));

  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <SectionCard title="Credit burn-down by month">
        <div className="flex items-end gap-4 px-6 py-5" style={{ height: 180 }}>
          {months.map(([label, value]) => (
            <div key={label} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-32 w-full items-end">
                <div
                  className={`w-full rounded-t-sm ${value < 0 ? "bg-brand-ink" : "bg-brand-lime-strong"}`}
                  style={{ height: `${(Math.abs(value) / maxAbs) * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xs font-medium">{value > 0 ? `+${value}c` : `${value}c`}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Credit burn-down by project">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Quoted</TableHead>
              <TableHead>Actual</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.creditsQuoted}c</TableCell>
                <TableCell>{p.creditsActual ?? p.creditsQuoted}c</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard title="Ledger">
        <div className="divide-y divide-border ">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <div>
                <p className="font-medium">{e.note}</p>
                <p className="text-xs text-muted-foreground">{formatDate(e.createdAt)}</p>
              </div>
              <p className={e.amount > 0 ? "font-medium text-success-foreground" : "font-medium"}>
                {e.amount > 0 ? `+${e.amount}c` : `${e.amount}c`}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
