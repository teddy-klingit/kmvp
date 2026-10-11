import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SectionCard, CardBody } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { Button } from "@/components/ds/button";
import { Field, textareaClass } from "@/components/ops/form-field";
import { jsonArray } from "@/lib/utils";
import { typefaces } from "@/lib/brand-typography";
import { updateBrandOSAction } from "@/lib/actions/ops-brand-os-actions";
import { RulesView } from "@/components/portal/rules/rules-view";

export default async function BrandOSEditorPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const client = await prisma.client.findUnique({ where: { id: clientId }, include: { brandOS: true } });
  if (!client) notFound();

  const b = client.brandOS;
  const colors = jsonArray<string>(b?.approvedColors);

  return (
    <div className="flex flex-col gap-6">
      {/* Brand OS → Rules, as the client sees it; Klingit's edits show as "· Klingit" and tell the account lead. */}
      <RulesView clientId={clientId} mode="staff" />
    <form action={updateBrandOSAction} className="flex flex-col gap-6">
      <input type="hidden" name="clientId" value={clientId} />

      <SectionCard title="Typography">
        <CardBody className="grid grid-cols-1 gap-5">
          <Field label="Approved typography" htmlFor="approvedTypography">
            <textarea
              id="approvedTypography"
              name="approvedTypography"
              defaultValue={typefaces(b?.approvedTypography).map((t) => t.text).join("\n")}
              className={`${textareaClass} min-h-32`}
              placeholder="One typeface per line"
            />
          </Field>
        </CardBody>
      </SectionCard>

      <SectionCard title="Approved colours" meta={colors.length > 0 ? <span className="font-brand-mono text-[12px] text-brand-ink-2">{colors.length}</span> : undefined}>
        <CardBody className="flex flex-col gap-3">
          <Field label="Hex values, one per line" htmlFor="approvedColors">
            <textarea id="approvedColors" name="approvedColors" defaultValue={colors.join("\n")} className={`${textareaClass} min-h-20 font-brand-mono text-[13px]`} />
          </Field>
          {colors.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => (
                <span key={c} className="size-7 rounded-full ring-1 ring-inset ring-black/10" style={{ backgroundColor: c }} title={c} />
              ))}
            </div>
          )}
        </CardBody>
      </SectionCard>

      <SectionCard
        title="Figma sync"
        meta={b?.lastSyncedAt ? <StatusPill tone="success">Connected</StatusPill> : <StatusPill>Not connected</StatusPill>}
        action={
          <Button type="button" variant="secondary" size="sm">
            {b?.figmaSyncConfig ? "Reconfigure" : "Connect Figma"}
          </Button>
        }
      >
        <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">
          {b?.lastSyncedAt ? "Last synced automatically from the component library." : "Connect the client's component library to sync it into Brand OS."}
        </p>
      </SectionCard>

      <Button type="submit" variant="primary" size="lg" className="self-start">
        Save changes
      </Button>
    </form>
    </div>
  );
}
