import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function BrandHealthGapsPage() {
  const viewer = await getPortalViewer();
  const brandOS = await prisma.brandOS.findUnique({ where: { clientId: viewer.clientId } });

  const components = [
    { label: "Figma library", pct: brandOS?.figmaLibraryPct ?? 0, detail: "Sync more of your component library so agents can pull on-spec templates." },
    { label: "Asset archive", pct: brandOS?.assetArchivePct ?? 0, detail: "Older projects haven't been indexed yet — ask your account lead to backfill." },
    { label: "Quality benchmarks", pct: brandOS?.qualityBenchmarksPct ?? 0, detail: "Not enough approved work yet to set reliable quality benchmarks." },
  ].filter((c) => c.pct < 90);

  return (
    <div className="flex flex-col gap-3">
      {components.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">No gaps — your brand foundation is fully built out.</p>
        </Card>
      ) : (
        components.map((c) => (
          <Card key={c.label} className="flex items-center justify-between gap-4 border-l-4 border-l-accent p-5">
            <div>
              <p className="text-sm font-semibold">{c.label}</p>
              <p className="text-sm text-muted-foreground">{c.detail}</p>
            </div>
            <Badge tone="warning">{c.pct}%</Badge>
          </Card>
        ))
      )}
    </div>
  );
}
