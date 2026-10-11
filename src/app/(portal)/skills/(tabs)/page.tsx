import Link from "next/link";
import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { aiCreditStatus } from "@/lib/ai-credits";
import { BUILT_IN_ASSISTANTS, RECOMMENDED_SKILLS, SKILL_CATEGORIES, listSkills, listSkillBuilds } from "@/lib/skills";
import { Card, CardHeader, CardRows, SectionCard } from "@/components/ds/card";
import { PageGrid } from "@/components/ds/page-grid";
import { PillLink } from "@/components/ds/pill-link";
import { pillClass } from "@/components/ds/button";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";
import { SkillIcon } from "@/components/portal/skills/skill-icon";
import { CustomSkillRequest } from "@/components/portal/skills/custom-skill-request";
import { AiCreditMeter } from "@/components/portal/skills/ai-credit-meter";
import { cn } from "@/lib/utils";

const CUSTOM = "Your custom skills";
const n = (v: number) => Math.round(v).toLocaleString("en-GB");

/**
 * Skills → Run a skill (nav v3, 02): every skill ready to run, by category, with its ≈ AI credits per run and this
 * month's use; on the side the AI credits left, what Klingit recommends building, and the built-in assistants.
 */
export default async function RunSkillPage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const { cat } = await searchParams;
  const viewer = await getPortalViewer();
  const [skills, ai, builds] = await Promise.all([listSkills(viewer.clientId), aiCreditStatus(viewer.clientId), listSkillBuilds(viewer.clientId)]);
  const ready = skills.filter((s) => s.live);
  const standard = ready.filter((s) => !s.custom).length;
  const custom = ready.length - standard;
  const shown = cat === CUSTOM ? ready.filter((s) => s.custom) : cat && (SKILL_CATEGORIES as readonly string[]).includes(cat) ? ready.filter((s) => s.category === cat) : ready;
  const chips = ["All", ...SKILL_CATEGORIES, ...(custom ? [CUSTOM] : [])];
  const requested = new Set(builds.map((b) => b.name.toLowerCase()));

  return (
    <PageGrid
      main={
        <Card className="overflow-hidden" aria-label="Ready to run">
          <CardHeader title="Ready to run" action={<span className="font-brand-mono text-[12px] text-brand-ink">{custom ? `${standard} + ${custom} CUSTOM` : standard}</span>} />
          <div className="flex flex-wrap items-center gap-2 px-6 pb-2 pt-5">
            {chips.map((c) => {
              const on = (c === "All" && !cat) || c === cat;
              return (
                <Link key={c} href={c === "All" ? "/skills" : `/skills?${new URLSearchParams({ cat: c })}`} aria-current={on ? "page" : undefined} className={cn("inline-flex h-8 items-center rounded-full px-3.5 text-[14px] no-underline", on ? "bg-brand-ink text-white" : "bg-brand-chip text-brand-ink hover:bg-brand-line")}>
                  {c}
                </Link>
              );
            })}
            <PlaceholderTag className="ml-auto">Credit costs are placeholders</PlaceholderTag>
          </div>
          <CardRows>
            {shown.length === 0 && <li className="px-6 py-5 text-[14px] text-brand-ink-2">No skills here yet.</li>}
            {shown.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
                <SkillIcon category={s.category} custom={s.custom} />
                <span className="flex min-w-0 flex-1 basis-[240px] flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <Link href={`/skills/${s.id}`} className="text-[16px] text-brand-ink no-underline hover:underline">
                      {s.name}
                    </Link>
                    <span className="rounded-full bg-brand-chip px-2 py-0.5 text-[12px]">{s.custom ? "Custom" : s.category}</span>
                  </span>
                  <span className="text-[14px] text-brand-ink-2">
                    {s.custom ? "Custom · " : ""}
                    {s.summary}
                  </span>
                </span>
                <span className="flex flex-col items-end text-right">
                  <span className="text-[14px] text-brand-ink">{s.aiPerRun != null ? `≈ ${n(s.aiPerRun)} AI credits` : "AI credits per run"}</span>
                  <span className="text-[13px] text-brand-mute">{s.runsThisMonth ? `Used ${s.runsThisMonth}× this month` : "Not used yet"}</span>
                </span>
                <Link href={`/skills/${s.id}`} className={pillClass("primary", "sm")}>
                  Run
                </Link>
              </li>
            ))}
          </CardRows>
        </Card>
      }
      side={
        <>
          <SectionCard title="AI credits" action={<span className="font-brand-mono text-[12px] text-brand-ink">{ai.plan.name.toUpperCase()} PLAN</span>}>
            <div className="flex flex-col gap-4 px-6 py-5">
              {ai.ownModel ? (
                <p className="m-0 text-[15px] leading-[1.5]">You&apos;re on Basic: skills and assistants run on your own AI model, connected in Settings → Connections. Your provider bills the tokens.</p>
              ) : (
                <>
                  <span className="flex items-baseline gap-2">
                    <span className="text-[44px] font-light leading-none tabular-nums">{n(ai.left)}</span>
                    <span className="text-[14px] text-brand-ink-2">left of {n(ai.allowance)} this month</span>
                  </span>
                  <AiCreditMeter used={ai.used} allowance={ai.allowance} />
                </>
              )}
              <p className="m-0 text-[14px] leading-[1.5] text-brand-ink-2">Every skill run and every assistant answer uses AI credits. Klingit&apos;s own production work never does.</p>
              <span className="flex flex-wrap gap-2">
                {isClientAdmin(viewer) && !ai.ownModel && (
                  <PillLink href="/settings/usage#top-up" variant="primary" size="sm">
                    Top up
                  </PillLink>
                )}
                <PillLink href="/settings/usage" size="sm">
                  Usage
                </PillLink>
              </span>
            </div>
          </SectionCard>

          <SectionCard title="Klingit recommends">
            <CardRows>
              {RECOMMENDED_SKILLS.slice(0, 2).map((r) => (
                <li key={r.name} className="flex flex-col gap-2 px-6 py-4">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="flex-1 text-[15px]">{r.name}</span>
                    <span className="rounded-full bg-brand-lime-pale px-2 py-0.5 text-[12px]">{r.reason}</span>
                  </span>
                  <span className="text-[14px] leading-[1.5] text-brand-ink-2">{r.summary}</span>
                  {requested.has(r.name.toLowerCase()) ? (
                    <span className="text-[13px] text-brand-ink-2">Requested · being built</span>
                  ) : (
                    <span>
                      <CustomSkillRequest label="Request build" name={r.name} description={r.summary} size="sm" />
                    </span>
                  )}
                </li>
              ))}
            </CardRows>
          </SectionCard>

          <SectionCard title="Built-in assistants">
            <p className="m-0 px-6 pt-4 text-[14px] leading-[1.5] text-brand-ink-2">These work inside Brief, Insights and Home. They also use AI credits, shown on each answer.</p>
            <CardRows>
              {BUILT_IN_ASSISTANTS.map((a) => (
                <li key={a.key} className="flex flex-col px-6 py-3">
                  <span className="text-[15px]">{a.name}</span>
                  <span className="text-[13px] text-brand-mute">{a.summary}</span>
                </li>
              ))}
            </CardRows>
          </SectionCard>
        </>
      }
    />
  );
}
