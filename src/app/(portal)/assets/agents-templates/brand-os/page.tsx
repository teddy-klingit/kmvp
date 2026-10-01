import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card, SectionLabel } from "@/components/ui/card";
import { jsonArray } from "@/lib/utils";

export default async function ClientBrandOSPage() {
  const viewer = await getPortalViewer();
  const brandOS = await prisma.brandOS.findUnique({ where: { clientId: viewer.clientId } });

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <SectionLabel>Tone rules</SectionLabel>
          <Card className="flex flex-col gap-2 p-5">
            {jsonArray<string>(brandOS?.toneRules).map((r, i) => (
              <p key={i} className="text-sm text-muted-foreground">
                • {r}
              </p>
            ))}
          </Card>
        </div>
        <div className="flex flex-col gap-3">
          <SectionLabel>Approved typography</SectionLabel>
          <Card className="flex flex-col gap-2 p-5">
            {jsonArray<string>(brandOS?.approvedTypography).map((r, i) => (
              <p key={i} className="text-sm text-muted-foreground">
                • {r}
              </p>
            ))}
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <SectionLabel>Do&apos;s</SectionLabel>
          <Card className="flex flex-col gap-2 p-5">
            {jsonArray<string>(brandOS?.dos).map((r, i) => (
              <p key={i} className="text-sm text-success-foreground">
                ✓ {r}
              </p>
            ))}
          </Card>
        </div>
        <div className="flex flex-col gap-3">
          <SectionLabel>Don&apos;ts</SectionLabel>
          <Card className="flex flex-col gap-2 p-5">
            {jsonArray<string>(brandOS?.donts).map((r, i) => (
              <p key={i} className="text-sm text-danger-foreground">
                ✕ {r}
              </p>
            ))}
          </Card>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel>Approved colors</SectionLabel>
        <div className="flex gap-3">
          {jsonArray<string>(brandOS?.approvedColors).map((c) => (
            <div key={c} className="flex flex-col items-center gap-1">
              <span className="size-12 rounded-full border border-border" style={{ backgroundColor: c }} />
              <span className="text-xs text-muted-foreground">{c}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        This is a read-only view. Your Klingit account lead maintains the source Brand OS.
      </p>
    </div>
  );
}
