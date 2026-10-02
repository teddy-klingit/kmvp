import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SectionCard, CardBody } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { Button } from "@/components/ds/button";
import { Field, textareaClass } from "@/components/ops/form-field";
import { jsonArray } from "@/lib/utils";
import { updateBrandOSAction } from "@/lib/actions/ops-brand-os-actions";

export default async function BrandOSEditorPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const client = await prisma.client.findUnique({ where: { id: clientId }, include: { brandOS: true } });
  if (!client) notFound();

  const b = client.brandOS;
  const colors = jsonArray<string>(b?.approvedColors);

  return (
    <form action={updateBrandOSAction} className="flex flex-col gap-6">
      <input type="hidden" name="clientId" value={clientId} />

      <SectionCard title="Voice & typography">
        <CardBody className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Field label="Tone rules" htmlFor="toneRules">
            <textarea id="toneRules" name="toneRules" defaultValue={jsonArray<string>(b?.toneRules).join("\n")} className={`${textareaClass} min-h-32`} placeholder="One rule per line" />
          </Field>
          <Field label="Approved typography" htmlFor="approvedTypography">
            <textarea
              id="approvedTypography"
              name="approvedTypography"
              defaultValue={jsonArray<string>(b?.approvedTypography).join("\n")}
              className={`${textareaClass} min-h-32`}
              placeholder="One typeface per line"
            />
          </Field>
        </CardBody>
      </SectionCard>

      <SectionCard title="Do's and don'ts">
        <CardBody className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Field label="Do's" htmlFor="dos">
            <textarea id="dos" name="dos" defaultValue={jsonArray<string>(b?.dos).join("\n")} className={`${textareaClass} min-h-28`} placeholder="One per line" />
          </Field>
          <Field label="Don'ts" htmlFor="donts">
            <textarea id="donts" name="donts" defaultValue={jsonArray<string>(b?.donts).join("\n")} className={`${textareaClass} min-h-28`} placeholder="One per line" />
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
  );
}
