import { notFound } from "next/navigation";
import Link from "next/link";
import { Sparkles, Check, ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card, CardHeader, CardNote, CardRows, SectionCard } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { PageGrid } from "@/components/ds/page-grid";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate } from "@/lib/utils";
import { SelfServiceAgentForm } from "@/components/portal/self-service-agent-form";
import { SelfServiceOutput } from "@/components/portal/self-service-output";

export default async function ClientAgentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const { agentId } = await params;
  const { sent } = await searchParams;
  const viewer = await getPortalViewer();

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) notFound();

  const [runs, channels] = await Promise.all([
    prisma.agentRun.findMany({
      where: { agentId, clientId: viewer.clientId },
      include: { project: true, requestedByUser: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.connectedChannel.findMany({ where: { clientId: viewer.clientId }, orderBy: { connectedAt: "asc" } }),
  ]);

  const selfServeRuns = runs.filter((r) => r.requestedByUserId);
  const latestSelfServeRun = selfServeRuns[0];
  const pipelineRuns = agent.selfService ? runs.filter((r) => !r.requestedByUserId) : runs;

  const when = (d: Date) => formatDate(d, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col gap-4">
      <Link href="/assets/agents-templates" className="-ml-1 inline-flex min-h-11 items-center gap-1 self-start text-[13px] text-brand-ink-2 no-underline hover:text-brand-ink sm:min-h-0">
        <ChevronLeft className="size-4" strokeWidth={1.75} />
        All agents
      </Link>
      <PageGrid
        main={
          <>
            <Card className="flex flex-wrap items-start gap-4 px-6 py-6">
              <div className="flex min-w-0 flex-1 basis-[260px] flex-col gap-1.5">
                <h2 className="m-0 text-[24px] font-normal leading-[1.25] text-brand-ink">{agent.name}</h2>
                <p className="m-0 text-[15px] leading-[1.5] text-brand-ink-2">{agent.description}</p>
              </div>
              {agent.selfService && (
                <StatusPill className="shrink-0">
                  <Sparkles className="size-3" /> Self-service
                </StatusPill>
              )}
            </Card>

            {sent === "1" && (
              <Card role="status" className="flex items-center gap-2.5 px-6 py-4 text-[14px] text-brand-ink">
                <Check className="size-4 shrink-0 text-brand-lime-strong" strokeWidth={2} />
                Sent — your team will find it in the channel you picked.
              </Card>
            )}

            {agent.selfService && (
              // Card (not SectionCard) so menus inside the form and output aren't clipped.
              <Card aria-label="Generate">
                <CardHeader title="Generate" />
                <div className="flex flex-col gap-5 px-6 pb-6 pt-5">
                  <SelfServiceAgentForm agentId={agent.id} agentKey={agent.key} />
                  {latestSelfServeRun && (
                    <div className="flex flex-col gap-2 border-t border-brand-line pt-5">
                      <p className="m-0 font-brand-mono text-[11px] text-brand-ink-2">LATEST GENERATION · {when(latestSelfServeRun.createdAt).toUpperCase()}</p>
                      <SelfServiceOutput agentId={agent.id} agentKey={agent.key} status={latestSelfServeRun.status} output={latestSelfServeRun.output} channels={channels} />
                    </div>
                  )}
                </div>
              </Card>
            )}

            {agent.selfService && selfServeRuns.length > 1 && (
              <SectionCard title="Your past generations">
                <CardRows>
                  {selfServeRuns.slice(1).map((r) => (
                    <RunRow key={r.id} title={r.decision ?? "Generation completed"} detail={`${r.requestedByUser?.name ?? "You"} · ${when(r.createdAt)}`} status={r.status} />
                  ))}
                </CardRows>
              </SectionCard>
            )}
          </>
        }
        side={
          <>
            <SectionCard title="Settings">
              <div className="flex flex-col gap-3 px-6 py-5">
                <label className="flex items-center gap-2.5 text-[14px] text-brand-ink">
                  <Checkbox defaultChecked />
                  Notify me when this agent flags something for review
                </label>
                <label className="flex items-center gap-2.5 text-[14px] text-brand-ink">
                  <Checkbox defaultChecked />
                  Include this agent&apos;s output in weekly reports
                </label>
              </div>
            </SectionCard>

            <SectionCard title={agent.selfService ? "Internal pipeline runs" : "Run history"}>
              {pipelineRuns.length === 0 ? (
                <CardNote>{agent.selfService ? "No internal project runs for your account yet." : "No runs yet."}</CardNote>
              ) : (
                <CardRows>
                  {pipelineRuns.map((r) => (
                    <RunRow key={r.id} title={r.decision ?? "Run completed"} detail={[r.project?.name, when(r.createdAt)].filter(Boolean).join(" · ")} status={r.status} />
                  ))}
                </CardRows>
              )}
            </SectionCard>
          </>
        }
      />
    </div>
  );
}

function RunRow({ title, detail, status }: { title: string; detail: string; status: string }) {
  return (
    <li className="flex items-center gap-3 px-6 py-3.5">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] text-brand-ink">{title}</span>
        <span className="text-[12px] text-brand-ink-2">{detail}</span>
      </span>
      <StatusPill tone={status === "SUCCESS" ? "success" : status === "FLAGGED" ? "watch" : "danger"}>{status}</StatusPill>
    </li>
  );
}
