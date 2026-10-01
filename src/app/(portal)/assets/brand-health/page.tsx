import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/utils";

function tierFor(pct: number) {
  if (pct >= 90) return { label: "Complete", tone: "text-success-foreground", bar: "bg-success" };
  if (pct >= 60) return { label: "In progress", tone: "text-primary", bar: "bg-primary" };
  return { label: "Needs update", tone: "text-danger-foreground", bar: "bg-danger" };
}

export default async function BrandHealthOverviewPage() {
  const viewer = await getPortalViewer();
  const [brandOS, assetCount] = await Promise.all([
    prisma.brandOS.findUnique({ where: { clientId: viewer.clientId } }),
    prisma.asset.count({ where: { clientId: viewer.clientId } }),
  ]);

  const components = [
    { label: "Brand OS", pct: brandOS?.foundationPct ?? 0 },
    { label: "AI brand guidelines", pct: 100 },
    { label: "Figma library", pct: brandOS?.figmaLibraryPct ?? 0 },
    { label: "Tone of voice", pct: brandOS?.toneGuidelinesCount ? 100 : 0 },
    { label: "Asset archive", pct: brandOS?.assetArchivePct ?? 0 },
    { label: "Quality benchmarks", pct: brandOS?.qualityBenchmarksPct ?? 0 },
  ];
  const maturity = brandOS?.foundationPct ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex items-center gap-4 p-5">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-info-soft font-display text-xl font-light text-primary">
          {maturity}%
        </div>
        <div>
          <p className="text-sm font-semibold">Brand maturity</p>
          <p className="text-sm text-muted-foreground">
            {maturity >= 85
              ? "Well done. Your brand is in strong shape. A few gaps remain — see the breakdown below."
              : "Your brand OS is still being built out. Keep an eye on the gaps below."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {assetCount} total assets
            {brandOS?.lastSyncedAt && ` · updated ${formatDate(brandOS.lastSyncedAt)}`}
          </p>
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Foundation components</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {components.map((c) => {
            const t = tierFor(c.pct);
            return (
              <Card key={c.label} className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className={`text-sm font-semibold ${t.tone}`}>{c.pct}%</p>
                </div>
                <p className={`text-xs ${t.tone}`}>{t.label}</p>
                <Progress value={c.pct} indicatorClassName={t.bar} className="mt-2" />
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
