import { notFound } from "next/navigation";
import Link from "next/link";
import { Check, ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { aiCreditStatus, aiGate } from "@/lib/ai-credits";
import { Card, CardHeader, CardNote, CardRows, SectionCard } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { PageGrid } from "@/components/ds/page-grid";
import { PillLink } from "@/components/ds/pill-link";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";
import { formatDate } from "@/lib/utils";
import { SelfServiceAgentForm } from "@/components/portal/self-service-agent-form";
import { SelfServiceOutput } from "@/components/portal/self-service-output";
import { SkillIcon } from "@/components/portal/skills/skill-icon";
import { AiCreditMeter } from "@/components/portal/skills/ai-credit-meter";

const credits = (v: number | null) => (v == null ? null : `${Math.round(v * 10) / 10} AI credit${v === 1 ? "" : "s"}`);

/**
 * Skills → one skill: what it does, what a run costs (≈ AI credits, shown before you press Run), the form, the
 * latest output with what it actually used, and earlier runs. Every finished run is saved to the Output library.
 */
export default async function SkillPage({ params, searchParams }: { params: Promise<{ skillId: string }>; searchParams: Promise<{ sent?: string; template?: string }> }) {
  const { skillId } = await params;
  const { sent, template: templateId } = await searchParams;
  const viewer = await getPortalViewer();

  // Only skills this client may see: standard ones and their own custom skills, never Klingit's internal automation.
  const agent = await prisma.agent.findFirst({ where: { id: skillId, kind: "SKILL", OR: [{ clientId: null }, { clientId: viewer.clientId }] } });
  if (!agent) notFound();

  const [runs, channels, ai, gate, template, outputs] = await Promise.all([
    prisma.agentRun.findMany({ where: { agentId: agent.id, clientId: viewer.clientId, requestedByUserId: { not: null } }, include: { requestedByUser: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.connectedChannel.findMany({ where: { clientId: viewer.clientId }, orderBy: { connectedAt: "asc" } }),
    aiCreditStatus(viewer.clientId),
    aiGate(viewer.clientId, "skill"),
    templateId ? prisma.template.findFirst({ where: { id: templateId, OR: [{ clientId: viewer.clientId }, { clientId: null }] } }) : null,
    prisma.skillOutput.findMany({ where: { clientId: viewer.clientId, agentId: agent.id }, select: { agentRunId: true } }),
  ]);
  const latest = runs[0];
  const saved = new Set(outputs.map((o) => o.agentRunId));
  const live = agent.status === "LIVE";
  const when = (d: Date) => formatDate(d, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const estimate = agent.aiCreditsPerRun != null ? `≈ ${agent.aiCreditsPerRun} AI credits per run` : null;

  return (
    <div className="flex flex-col gap-4">
      <Link href={agent.clientId ? "/skills/yours" : "/skills"} className="-ml-1 inline-flex min-h-11 items-center gap-1 self-start text-[13px] text-brand-ink-2 no-underline hover:text-brand-ink sm:min-h-0">
        <ChevronLeft className="size-4" strokeWidth={1.75} />
        {agent.clientId ? "Your skills" : "Skills"}
      </Link>
      <PageGrid
        main={
          <>
            <Card className="flex flex-wrap items-start gap-4 px-6 py-6">
              <SkillIcon category={agent.skillCategory} custom={Boolean(agent.clientId)} size={48} />
              <div className="flex min-w-0 flex-1 basis-[260px] flex-col gap-1.5">
                <span className="flex flex-wrap items-center gap-2">
                  <h1 className="m-0 text-[26px] font-normal leading-[1.25] text-brand-ink">{agent.name}</h1>
                  <span className="rounded-full bg-brand-chip px-2.5 py-0.5 text-[13px]">{agent.clientId ? "Custom" : agent.skillCategory}</span>
                  {!live && <StatusPill>Paused</StatusPill>}
                </span>
                <p className="m-0 text-[15px] leading-[1.5] text-brand-ink-2">{agent.summary ?? agent.description}</p>
              </div>
            </Card>

            {sent === "1" && (
              <Card role="status" className="flex items-center gap-2.5 px-6 py-4 text-[14px] text-brand-ink">
                <Check className="size-4 shrink-0 text-brand-lime-strong" strokeWidth={2} />
                Sent: your team will find it in the channel you picked.
              </Card>
            )}

            <Card aria-label="Run">
              <CardHeader title="Run" meta={template ? <span className="text-[13px] text-brand-ink-2">From the template “{template.name}”</span> : undefined} action={estimate ? <PlaceholderTag>Credit cost is a placeholder</PlaceholderTag> : undefined} />
              <div className="flex flex-col gap-5 px-6 pb-6 pt-5">
                {!live ? (
                  <p className="m-0 text-[15px] text-brand-ink-2">This skill is paused. Resume it under Your skills to run it.</p>
                ) : !gate.ok ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-[12px] bg-brand-peach-pale px-4 py-3">
                    <span aria-hidden className="size-2 shrink-0 rounded-full bg-brand-orange" />
                    <span className="min-w-0 flex-1 text-[14px]">{gate.error}</span>
                    {gate.topUp && isClientAdmin(viewer) && (
                      <PillLink href="/settings/usage#top-up" variant="primary" size="sm">
                        Top up
                      </PillLink>
                    )}
                  </div>
                ) : (
                  <SelfServiceAgentForm agentId={agent.id} agentKey={agent.key} template={template ? { name: template.name, category: template.category } : null} cost={estimate ? `${estimate} · ${ai.ownModel ? "on your own model" : `${Math.floor(ai.left)} left this month`}` : null} />
                )}
                {latest && (
                  <div className="flex flex-col gap-2 border-t border-brand-line pt-5">
                    <p className="m-0 flex flex-wrap gap-x-3 font-brand-mono text-[11px] text-brand-ink-2">
                      <span>LATEST RUN · {when(latest.createdAt).toUpperCase()}</span>
                      {latest.aiCredits != null && <span>USED {credits(latest.aiCredits)?.toUpperCase()}</span>}
                      {saved.has(latest.id) && (
                        <Link href="/library?made=skills" className="text-brand-ink underline underline-offset-2">
                          SAVED TO THE OUTPUT LIBRARY
                        </Link>
                      )}
                    </p>
                    <SelfServiceOutput agentId={agent.id} agentKey={agent.key} status={latest.status} output={latest.output} channels={channels} />
                  </div>
                )}
              </div>
            </Card>

            {runs.length > 1 && (
              <SectionCard title="Earlier runs">
                <CardRows>
                  {runs.slice(1).map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-6 py-3.5">
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[15px] text-brand-ink">{r.decision ?? (r.status === "SUCCESS" ? "Run finished" : "Run failed")}</span>
                        <span className="text-[12px] text-brand-ink-2">
                          {r.requestedByUser?.name ?? "You"} · {when(r.createdAt)}
                          {r.aiCredits != null ? ` · ${credits(r.aiCredits)}` : ""}
                        </span>
                      </span>
                      {r.status !== "SUCCESS" && <StatusPill tone="danger">Failed</StatusPill>}
                    </li>
                  ))}
                </CardRows>
              </SectionCard>
            )}
          </>
        }
        side={
          <SectionCard title="AI credits" action={<span className="font-brand-mono text-[12px] text-brand-ink">{ai.plan.name.toUpperCase()} PLAN</span>}>
            {ai.ownModel ? (
              <CardNote>On Basic, runs use your own AI model (Settings → Connections) and your provider bills the tokens.</CardNote>
            ) : (
              <div className="flex flex-col gap-3 px-6 py-5">
                <span className="flex items-baseline gap-2">
                  <span className="text-[36px] font-light leading-none tabular-nums">{Math.floor(ai.left).toLocaleString("en-GB")}</span>
                  <span className="text-[14px] text-brand-ink-2">left of {ai.allowance.toLocaleString("en-GB")}</span>
                </span>
                <AiCreditMeter used={ai.used} allowance={ai.allowance} />
                <span className="text-[13px] leading-[1.5] text-brand-ink-2">{estimate ? `This skill uses ${estimate.replace(" per run", "")} a run, from real token use. ` : ""}Klingit&apos;s own production work never uses your AI credits.</span>
              </div>
            )}
          </SectionCard>
        }
      />
    </div>
  );
}
