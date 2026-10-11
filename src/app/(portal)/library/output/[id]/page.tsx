import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { formatDay } from "@/lib/project-state";
import { CardRows, SectionCard } from "@/components/ds/card";
import { PillLink } from "@/components/ds/pill-link";

/** Output library → something a skill made: the output itself, which skill, who ran it and when, and run it again. */
export default async function SkillOutputPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getPortalViewer();
  const output = await prisma.skillOutput.findFirst({ where: { id, clientId: viewer.clientId } });
  if (!output) notFound();
  const [skill, by, run] = await Promise.all([
    output.agentId ? prisma.agent.findUnique({ where: { id: output.agentId }, select: { id: true, name: true } }) : null,
    output.createdByUserId ? prisma.user.findUnique({ where: { id: output.createdByUserId }, select: { name: true } }) : null,
    output.agentRunId ? prisma.agentRun.findUnique({ where: { id: output.agentRunId }, select: { aiCredits: true } }) : null,
  ]);
  const image = output.storageKey && output.mimeType?.startsWith("image/") ? `/api/skill-outputs/${output.id}/file` : null;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/library" className="inline-flex items-center gap-1 self-start text-[14px] text-brand-ink-2 no-underline hover:text-brand-ink">
        <ChevronLeft className="size-4" strokeWidth={1.75} /> Output library
      </Link>
      <div className="grid grid-cols-1 gap-6 min-[1000px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-[12px] bg-[#F2EDE3] p-6">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element -- the client's own access-checked output
            <img src={image} alt={output.title} className="max-h-[60vh] max-w-full rounded-[10px] object-contain shadow-md" />
          )}
          {output.text && <pre className="m-0 w-full max-w-[640px] whitespace-pre-wrap rounded-[12px] bg-white p-6 font-brand text-[15px] leading-[1.55]">{output.text}</pre>}
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-1">
            <span className="self-start rounded-full bg-[#F7E6F7] px-2.5 py-0.5 text-[13px]">Made with a skill</span>
            <h1 className="m-0 text-[28px] font-normal leading-tight">{output.title}</h1>
            <span className="text-[15px] text-brand-ink-2">{[output.format, output.channel].filter(Boolean).join(" · ")}</span>
          </div>
          <SectionCard title="About this output">
            <CardRows>
              {[
                ["Skill", skill ? <Link key="s" href={`/skills/${skill.id}`} className="text-brand-ink underline underline-offset-2">{skill.name}</Link> : "—"],
                ["Run by", by?.name ?? "—"],
                ["When", formatDay(output.createdAt)],
                ["AI credits used", run?.aiCredits != null ? String(Math.round(run.aiCredits * 10) / 10) : "—"],
              ].map(([k, v]) => (
                <li key={String(k)} className="flex items-center justify-between gap-4 px-6 py-3.5 text-[15px]">
                  <span className="text-brand-ink-2">{k}</span>
                  <span className="text-right">{v}</span>
                </li>
              ))}
            </CardRows>
          </SectionCard>
          <div className="flex flex-wrap gap-3">
            {skill && (
              <PillLink href={`/skills/${skill.id}`} variant="primary">
                Run again
              </PillLink>
            )}
            <a href={`/api/library/download?ids=s_${output.id}`} className="inline-flex items-center self-center text-[14px] text-brand-ink underline underline-offset-2">
              Download
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
