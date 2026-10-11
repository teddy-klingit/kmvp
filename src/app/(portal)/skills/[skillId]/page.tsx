import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Layers } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { aiCreditStatus, aiGate } from "@/lib/ai-credits";
import { PillLink } from "@/components/ds/pill-link";
import { StatusPill } from "@/components/ds/status-pill";
import { SkillIcon } from "@/components/portal/skills/skill-icon";
import { SkillRunForm, type StartOption } from "@/components/portal/skills/skill-run-form";
import { SkillVersions, type VersionView } from "@/components/portal/skills/skill-versions";
import { AskKlingit } from "@/components/portal/skills/ask-klingit";
import { brandProducts, formFor } from "@/lib/skill-forms";
import { loadLatestBatch } from "@/lib/skill-run";
import { jsonArray } from "@/lib/utils";
import { WORK_TZ } from "@/lib/working-hours";
import { cn } from "@/lib/utils";

const LABEL: Record<string, { text: string; tint: string }> = { self_service: { text: "Self-service", tint: "bg-brand-lime-pale" }, klingit_run: { text: "Run by Klingit", tint: "bg-brand-lavender-pale" }, custom: { text: "Custom", tint: "bg-[#F7E6F7]" } };
const SWATCHES = ["#FBF6F0", "#E4ECEE", "#F6CDB8", "#F6E7B8", "#F7E6F7"];
const when = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

/**
 * Run a skill (Phase R, design 03): the form on the left (chips, a Brand OS product, what to say, where to start,
 * versions, a project; the cost before Run), the versions on the right, each through the shared Brand OS check,
 * and "Ask Klingit to polish". A skill Klingit runs shows what it does and "Ask Klingit".
 */
export default async function SkillPage({ params, searchParams }: { params: Promise<{ skillId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { skillId } = await params;
  const q = await searchParams;
  const viewer = await getPortalViewer();
  const agent = await prisma.agent.findFirst({ where: { id: skillId, kind: "SKILL", OR: [{ clientId: null, availability: { in: ["self_service", "klingit_run"] } }, { clientId: viewer.clientId }] } });
  if (!agent) notFound();
  const availability = agent.clientId ? "custom" : (agent.availability ?? "self_service");
  const form = formFor(agent.key);

  const [ai, gate, brandOS, top, layouts, projects, batch, like, then] = await Promise.all([
    aiCreditStatus(viewer.clientId),
    aiGate(viewer.clientId, "skill"),
    prisma.brandOS.findUnique({ where: { clientId: viewer.clientId }, select: { keyProducts: true, colorPalette: true } }),
    prisma.asset.findFirst({ where: { clientId: viewer.clientId, performanceCtr: { not: null } }, orderBy: { performanceCtr: "desc" }, select: { name: true, thumbnailColor: true } }),
    prisma.template.findMany({ where: { OR: [{ clientId: viewer.clientId }, { clientId: null }] }, orderBy: { usageCount: "desc" }, take: 3 }),
    prisma.project.findMany({ where: { clientId: viewer.clientId, status: { notIn: ["ARCHIVED", "DELIVERED"] }, agentBuild: false }, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, name: true } }),
    loadLatestBatch(viewer.clientId, viewer.userId, agent),
    q.like ? prisma.skillOutput.findFirst({ where: { id: q.like, clientId: viewer.clientId }, select: { id: true, title: true } }) : null,
    q.then ? prisma.agent.findFirst({ where: { id: q.then, kind: "SKILL" }, select: { id: true, name: true } }) : null,
  ]);
  const likeAsset = q.likeAsset ? await prisma.asset.findFirst({ where: { id: q.likeAsset, clientId: viewer.clientId }, select: { id: true, name: true, thumbnailColor: true } }) : null;
  const palette = jsonArray<{ hex: string }>(brandOS?.colorPalette).map((c) => c.hex);
  const products = brandProducts(brandOS?.keyProducts).map((p, i) => ({ name: p.name, color: palette[i % Math.max(1, palette.length)] ?? SWATCHES[i % SWATCHES.length] }));
  const template = q.template ? layouts.find((t) => t.id === q.template) ?? (await prisma.template.findFirst({ where: { id: q.template, OR: [{ clientId: viewer.clientId }, { clientId: null }] } })) : null;
  const starts: StartOption[] = [
    { value: "blank", label: "Blank", color: "#F2EEE5" },
    ...(top ? [{ value: "top", label: `Like your top performer: ${top.name}`, color: "#E4ECEE" }] : []),
    ...(like ? [{ value: `like:${like.id}`, label: `More like: ${like.title}`, color: "#F6E7B8" }] : []),
    ...(likeAsset ? [{ value: `asset:${likeAsset.id}`, label: `More like: ${likeAsset.name}`, color: "#F6E7B8" }] : []),
    ...(template ?? layouts[0] ? [{ value: `layout:${(template ?? layouts[0])!.id}`, label: `Saved layout: ${(template ?? layouts[0])!.name}`, color: (template ?? layouts[0])!.previewColor }] : []),
  ].slice(0, 3);
  const startFrom = like ? `like:${like.id}` : likeAsset ? `asset:${likeAsset.id}` : template ? `layout:${template.id}` : top && q.start === "top" ? "top" : "blank";
  const left = ai.ownModel ? "on your own model" : `${Math.round(ai.left).toLocaleString("en-GB")} left this month`;
  const visual = ["ad_gen", "carousel_builder", "image_gen_agent"].includes(agent.key);
  const versions: VersionView[] = (batch?.versions ?? []).map((v) => ({ runId: v.runId, letter: v.letter, headline: v.copy.headline, body: v.copy.body, cta: v.copy.cta, image: v.image, imageError: v.imageError, check: v.check, saved: v.saved }));
  const thenHref = then && versions.length ? `/skills/${then.id}?${new URLSearchParams({ say: versions.map((v) => `${v.letter}: ${v.headline || v.body}`).join("\n"), versions: String(Math.min(versions.length, 4)) })}` : null;

  return (
    <div className="flex flex-col gap-4">
      <Link href={agent.clientId ? "/skills/yours" : "/skills"} className="-ml-1 inline-flex min-h-11 items-center gap-1 self-start text-[13px] text-brand-ink-2 no-underline hover:text-brand-ink sm:min-h-0">
        <ChevronLeft className="size-4" strokeWidth={1.75} />
        {agent.clientId ? "Your custom skills" : "All skills"}
      </Link>
      <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
        <section aria-label={agent.name} className="flex flex-col gap-6 rounded-[16px] bg-white px-6 py-6">
          <header className="flex items-start gap-4">
            <SkillIcon category={agent.skillCategory} custom={Boolean(agent.clientId)} size={48} />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <h1 className="m-0 text-[24px] font-normal leading-[1.2]">{agent.name}</h1>
              <span className="text-[14px] leading-[1.45] text-brand-ink-2">{agent.summary ?? agent.description}</span>
            </span>
            <span className={cn("shrink-0 rounded-[6px] px-2 py-0.5 text-[12px]", LABEL[availability].tint)}>{LABEL[availability].text}</span>
          </header>
          {availability === "klingit_run" ? (
            <div className="flex flex-col gap-3 border-t border-brand-line pt-5 text-[14px] leading-[1.5]">
              <p className="m-0 text-brand-ink-2">{agent.description}</p>
              <p className="m-0">≈ {agent.teamCreditsEstimate ?? "?"} team credits · Klingit confirms the price in the estimate.</p>
              {agent.key === "brand_check_service" ? <p className="m-0 text-brand-ink-2">Always on for Klingit&apos;s work: nothing to ask for.</p> : <AskKlingit skillId={agent.id} skillName={agent.name} teamCredits={agent.teamCreditsEstimate} />}
            </div>
          ) : agent.status !== "LIVE" ? (
            <p className="m-0 border-t border-brand-line pt-5 text-[15px] text-brand-ink-2">
              This skill is paused. Resume it under <Link href="/skills/yours">Your custom skills</Link> to run it.
            </p>
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
            <SkillRunForm
              agentId={agent.id}
              form={form}
              products={products}
              starts={starts}
              projects={projects}
              aiPerRun={agent.aiCreditsPerRun}
              left={left}
              initial={{ format: q.format ?? batch?.settings.format ?? null, channel: q.channel ?? batch?.settings.channel ?? null, product: q.product ?? batch?.settings.product ?? null, say: q.say ?? batch?.settings.say ?? "", versions: Number(q.versions ?? batch?.settings.versions ?? 3), startFrom }}
            />
          )}
        </section>

        <div className="flex flex-col gap-4">
          {batch && versions.length > 0 ? (
            <>
              <div className="flex flex-wrap items-baseline gap-3">
                <h2 className="m-0 flex-1 text-[22px] font-normal">
                  {versions.length} version{versions.length === 1 ? "" : "s"}
                </h2>
                <span className="text-[13px] text-brand-ink-2">
                  Used {batch.credits} AI credits · {when(batch.startedAt)}
                </span>
              </div>
              <SkillVersions agentId={agent.id} versions={versions} format={batch.settings.format} visual={visual} then={then && thenHref ? { href: thenHref, name: then.name } : null} />
            </>
          ) : (
            availability !== "klingit_run" && (
              <div className="flex min-h-60 flex-col items-center justify-center gap-2 rounded-[16px] border border-dashed border-brand-field px-6 text-center text-[14px] text-brand-ink-2">
                Your versions show here, side by side, each checked against your Brand OS rules.
                {agent.status !== "LIVE" && <StatusPill>Paused</StatusPill>}
              </div>
            )
          )}
          <p className="m-0 flex items-center gap-2 text-[13px] text-brand-ink-2">
            <Layers className="size-4" strokeWidth={1.75} />
            Saved versions go to the Output library, tagged “Made with a skill”.
          </p>
        </div>
      </div>
    </div>
  );
}
