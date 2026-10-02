import { Check, X } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { SectionCard, CardRows } from "@/components/ds/card";
import { PageGrid } from "@/components/ds/page-grid";
import { EmptyState } from "@/components/ds/empty-state";
import { jsonArray } from "@/lib/utils";

export default async function ClientBrandOSPage() {
  const viewer = await getPortalViewer();
  const brandOS = await prisma.brandOS.findUnique({ where: { clientId: viewer.clientId } });

  const toneRules = jsonArray<string>(brandOS?.toneRules);
  const typography = jsonArray<string>(brandOS?.approvedTypography);
  const dos = jsonArray<string>(brandOS?.dos);
  const donts = jsonArray<string>(brandOS?.donts);
  const colors = jsonArray<string>(brandOS?.approvedColors);

  const readOnly = <p className="m-0 text-[13px] leading-[1.5] text-brand-ink-2">This is a read-only view. Your Klingit account lead maintains the source Brand OS.</p>;

  if (toneRules.length + typography.length + dos.length + donts.length + colors.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState title="No Brand OS rules on file yet." />
        {readOnly}
      </div>
    );
  }

  return (
    <PageGrid
      main={
        <>
          {toneRules.length > 0 && (
            <SectionCard title="Tone rules">
              <RuleList items={toneRules} />
            </SectionCard>
          )}
          {dos.length > 0 && (
            <SectionCard title="Do’s">
              <RuleList items={dos} icon={<Check className="mt-[3px] size-4 shrink-0 text-brand-lime-strong" strokeWidth={2} />} />
            </SectionCard>
          )}
          {donts.length > 0 && (
            <SectionCard title="Don’ts">
              <RuleList items={donts} icon={<X className="mt-[3px] size-4 shrink-0 text-ds-danger-text" strokeWidth={2} />} />
            </SectionCard>
          )}
        </>
      }
      side={
        <>
          {typography.length > 0 && (
            <SectionCard title="Approved typography">
              <RuleList items={typography} />
            </SectionCard>
          )}
          {colors.length > 0 && (
            <SectionCard title="Approved colours">
              <ul className="m-0 flex list-none flex-wrap gap-4 px-6 py-5">
                {colors.map((c) => (
                  <li key={c} className="flex flex-col items-center gap-1.5">
                    <span className="size-12 rounded-full border border-brand-line" style={{ backgroundColor: c }} />
                    <span className="font-brand-mono text-[11px] text-brand-ink-2">{c}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
          {readOnly}
        </>
      }
    />
  );
}

function RuleList({ items, icon }: { items: string[]; icon?: React.ReactNode }) {
  return (
    <CardRows>
      {items.map((r, i) => (
        <li key={i} className="flex items-start gap-2.5 px-6 py-3.5 text-[14px] leading-[1.5] text-brand-ink">
          {icon}
          <span className="min-w-0">{r}</span>
        </li>
      ))}
    </CardRows>
  );
}
