import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ds/card";
import { SourceTag } from "@/components/ds/source-tag";
import { QualityBar } from "@/components/portal/brief-studio/brief-canvas";
import { jsonArray } from "@/lib/utils";
import { sectionFilled, SECTION_LABEL, type BriefSection } from "@/lib/brief-studio/model";
import { qualityLabel } from "@/lib/brief-studio/quality";
import type { PortalViewer } from "@/lib/brief-intake";

const TAG = { brandOS: ["brandOS", "From Brand OS"], answer: ["answer", "Your answer"], suggested: ["suggested", "Suggested"], pastProject: ["pastProject", "From a past project"] } as const;

/** Overview while the brief is still in the Brief studio: its score and what's in it so far. */
export async function BriefSummaryCard({ projectId, viewer }: { projectId: string; viewer: PortalViewer }) {
  const brief = await prisma.brief.findFirst({ where: { projectId, project: { clientId: viewer.clientId } }, select: { sections: true, qualityScore: true } });
  const sections = jsonArray<BriefSection>(brief?.sections).filter((s) => sectionFilled(s) && s.key !== "budget");
  const score = brief?.qualityScore ?? null;
  return (
    <Card aria-label="Your brief so far">
      <CardHeader
        title="Your brief so far"
        action={
          <Link href={`/brief/${projectId}`} className="font-brand-mono text-[12px] text-brand-ink underline underline-offset-4">
            Open brief studio
          </Link>
        }
      />
      {score !== null && (
        <div className="flex flex-col gap-2 border-b border-brand-line px-6 py-4">
          <span className="text-[14px]">
            <span className="font-semibold">Brief quality {score}</span> <span className="text-brand-mute">{qualityLabel(score)}</span>
          </span>
          <QualityBar score={score} compact />
        </div>
      )}
      {sections.length === 0 ? (
        <p className="m-0 px-6 py-5 text-[15px] text-brand-ink-2">Nothing written yet. The brief agent starts it from your Brand OS and past projects.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-brand-line p-0">
          {sections.map((s) => (
            <li key={s.key} className="flex flex-col gap-1 px-6 py-3.5">
              <span className="flex items-center gap-2">
                <span className="flex-1 text-[13px] font-semibold">{SECTION_LABEL[s.key]}</span>
                <SourceTag tone={TAG[s.source][0]}>{s.source === "pastProject" && s.sourceRef ? `From ${s.sourceRef.name}` : TAG[s.source][1]}</SourceTag>
              </span>
              <span className="text-[15px]">{s.value || [...(s.items ?? []), ...(s.refs ?? []).map((r) => r.label)].join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
