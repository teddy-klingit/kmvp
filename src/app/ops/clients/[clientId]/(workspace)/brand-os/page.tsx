import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, SectionLabel } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { jsonArray } from "@/lib/utils";
import { updateBrandOSAction } from "@/lib/actions/ops-brand-os-actions";

export default async function BrandOSEditorPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const client = await prisma.client.findUnique({ where: { id: clientId }, include: { brandOS: true } });
  if (!client) notFound();

  const b = client.brandOS;

  return (
    <>
      <div className="flex flex-col gap-6">

        <form action={updateBrandOSAction} className="flex flex-col gap-6">
          <input type="hidden" name="clientId" value={clientId} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <SectionLabel>Tone rules</SectionLabel>
              <Textarea name="toneRules" defaultValue={jsonArray<string>(b?.toneRules).join("\n")} className="min-h-32" placeholder="One rule per line" />
            </div>
            <div className="flex flex-col gap-1.5">
              <SectionLabel>Approved typography</SectionLabel>
              <Textarea name="approvedTypography" defaultValue={jsonArray<string>(b?.approvedTypography).join("\n")} className="min-h-32" placeholder="One typeface per line" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Do&apos;s</Label>
              <Textarea name="dos" defaultValue={jsonArray<string>(b?.dos).join("\n")} className="min-h-28" placeholder="One per line" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Don&apos;ts</Label>
              <Textarea name="donts" defaultValue={jsonArray<string>(b?.donts).join("\n")} className="min-h-28" placeholder="One per line" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <SectionLabel>Approved colors (hex, one per line)</SectionLabel>
            <Textarea name="approvedColors" defaultValue={jsonArray<string>(b?.approvedColors).join("\n")} className="min-h-20" />
            <div className="mt-1 flex gap-2">
              {jsonArray<string>(b?.approvedColors).map((c) => (
                <span key={c} className="size-6 rounded-full border border-border" style={{ backgroundColor: c }} title={c} />
              ))}
            </div>
          </div>

          <Card className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm font-semibold">Figma sync</p>
              <p className="text-sm text-muted-foreground">
                {b?.lastSyncedAt ? "Connected — last synced automatically from the component library." : "Not connected yet."}
              </p>
            </div>
            <Button type="button" variant="secondary">
              {b?.figmaSyncConfig ? "Reconfigure" : "Connect Figma"}
            </Button>
          </Card>

          <Button type="submit" className="self-start">
            Save changes
          </Button>
        </form>
      </div>
    </>
  );
}
