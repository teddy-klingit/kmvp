import Link from "next/link";
import { LayoutTemplate, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { monthPeriod } from "@/lib/ai-credits";
import { AVAILABILITY_LABEL, SKILL_GOALS, listSkills, type SkillAvailability, type SkillRow } from "@/lib/skills";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";
import { pillClass } from "@/components/ds/button";
import { SkillFinder } from "@/components/portal/skills/skill-finder";
import { AskKlingit } from "@/components/portal/skills/ask-klingit";
import { cn } from "@/lib/utils";

const PILL: Record<SkillAvailability, string> = { self_service: "bg-brand-lime-pale", klingit_run: "bg-brand-lavender-pale", custom: "bg-[#F7E6F7]" };
/** What a Klingit-run skill's card says under its cost. */
const KLINGIT_NOTE: Record<string, string> = { video_cutdowns: "Klingit edits, you review", localisation: "Per language", performance_deep_dive: "Klingit strategist", brand_check_service: "Runs on all Klingit work" };
const FILTERS: { key: SkillAvailability | null; label: string }[] = [
  { key: null, label: "All" },
  { key: "self_service", label: "Self-service" },
  { key: "klingit_run", label: "Run by Klingit" },
  { key: "custom", label: "Custom" },
];

/**
 * Skills → All skills (Phase R, design 02): "What do you want to make?", then every skill grouped by goal (Make an
 * ad · Write copy · Plan & brief) with its label (Self-service · Run by Klingit · Custom), real examples, cost, use
 * and the action. Self-service uses AI credits; Run by Klingit uses team credits.
 */
export default async function AllSkillsPage({ searchParams }: { searchParams: Promise<{ label?: string }> }) {
  const { label } = await searchParams;
  const viewer = await getPortalViewer();
  const { start, end } = monthPeriod();
  const [skills, assistants] = await Promise.all([
    listSkills(viewer.clientId),
    prisma.aiCreditLedger.aggregate({ where: { clientId: viewer.clientId, kind: "USAGE", sourceType: "assistant", createdAt: { gte: start, lt: end } }, _sum: { amount: true } }),
  ]);
  const shown = skills.filter((s) => s.live || s.custom);
  const active = FILTERS.find((f) => f.key === label)?.key ?? null;
  const visible = shown.filter((s) => !active || s.availability === active);
  const assistantCredits = Math.round(-(assistants._sum.amount ?? 0));

  return (
    <div className="flex flex-col gap-8">
      <SkillFinder />

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const count = f.key ? shown.filter((s) => s.availability === f.key).length : shown.length;
          const on = active === f.key;
          return (
            <Link key={f.label} href={f.key ? `/skills?label=${f.key}` : "/skills"} aria-current={on ? "page" : undefined} className={cn("inline-flex h-9 items-center rounded-full border px-3.5 text-[14px] no-underline", on ? "border-brand-ink bg-brand-ink text-white" : "border-brand-outline bg-white text-brand-ink hover:border-brand-ink")}>
              {f.label} · {count}
            </Link>
          );
        })}
        <span className="ml-auto flex items-center gap-2 text-[13px] text-brand-ink-2">
          Self-service uses AI credits · Run by Klingit uses team credits <PlaceholderTag>Costs</PlaceholderTag>
        </span>
      </div>

      {SKILL_GOALS.map((g) => {
        const group = visible.filter((s) => s.goal === g.goal);
        if (!group.length) return null;
        return (
          <section key={g.goal} aria-label={g.title} className="flex flex-col gap-4">
            <h2 className="m-0 flex flex-wrap items-baseline gap-3 text-[22px] font-normal">
              {g.title} <span className="text-[13px] text-brand-ink-2">{g.sub}</span>
            </h2>
            <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 min-[700px]:grid-cols-2 min-[1200px]:grid-cols-4">
              {group.map((s) => (
                <SkillCard key={s.id} skill={s} />
              ))}
            </ul>
          </section>
        );
      })}

      <p className="m-0 flex flex-wrap items-center gap-3 rounded-[12px] border border-dashed border-brand-field px-5 py-3.5 text-[14px] text-brand-ink-2">
        <Sparkles className="size-4" strokeWidth={1.75} />
        <span className="flex-1">Built-in assistants work inside Brief, Insights and Home: Brief assistant, Ask your data, Opportunities, Performance insights. They use AI credits too.</span>
        <span className="font-brand-mono text-[12px] uppercase text-brand-ink">{assistantCredits} AI this month</span>
      </p>
      <p className="m-0 flex flex-wrap items-center gap-3 rounded-[12px] border border-dashed border-brand-field px-5 py-3.5 text-[14px] text-brand-ink-2">
        <LayoutTemplate className="size-4" strokeWidth={1.75} />
        <span className="flex-1">
          Looking for templates? Pick one inside any skill under “Start from”, or use “Make more like this” on anything in the Output library. Saved layouts live in{" "}
          <Link href="/assets/visual-identity#layouts" className="text-brand-ink underline underline-offset-2">
            Brand OS → Visual identity
          </Link>
          .
        </span>
      </p>
    </div>
  );
}

function usage(s: SkillRow) {
  if (s.availability === "klingit_run") return KLINGIT_NOTE[s.key] ?? "Klingit does it, you review";
  if (s.custom) return s.runsThisMonth ? `Run ${s.runsThisMonth}× · built for you` : "Built for you";
  if (s.runsThisMonth) return `Used ${s.runsThisMonth}× this month`;
  return s.lastRunAt ? "Not used this month" : "Not used yet";
}

function SkillCard({ skill: s }: { skill: SkillRow }) {
  const klingit = s.availability === "klingit_run";
  const thumbs = [...s.examples, ...Array.from({ length: 3 }, () => null)].slice(0, 3);
  return (
    <li className="flex flex-col gap-3 rounded-[12px] bg-white p-3.5">
      <div className="grid grid-cols-3 gap-1.5" aria-hidden={s.examples.length === 0}>
        {thumbs.map((e, i) => (
          <span key={i} className="relative aspect-[9/10] overflow-hidden rounded-[6px]" style={{ backgroundColor: e?.color ?? ["#E4ECEE", "#F6CDB8", "#F6E7B8"][i] }} title={e?.title}>
            {e?.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- the client's own output, access-checked
              <img src={e.image} alt={e.title} loading="lazy" className="absolute inset-0 size-full object-cover" />
            ) : e?.text ? (
              <span className="absolute inset-0 line-clamp-5 p-1.5 text-[9px] leading-[1.3] text-brand-ink">{e.text}</span>
            ) : null}
          </span>
        ))}
      </div>
      <div className="flex items-start gap-2 px-0.5">
        <span className="min-w-0 flex-1 text-[16px] leading-[1.3]">{s.name}</span>
        <span className={cn("shrink-0 rounded-[6px] px-2 py-0.5 text-[12px]", PILL[s.availability])}>{AVAILABILITY_LABEL[s.availability]}</span>
      </div>
      <p className="m-0 line-clamp-2 min-h-[2.8em] px-0.5 text-[13px] leading-[1.4] text-brand-ink-2">{s.summary}</p>
      <div className="mt-auto flex items-end gap-2 px-0.5">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13px]">{klingit ? `≈ ${s.teamCredits ?? "?"} team credits` : s.aiPerRun != null ? `≈ ${s.aiPerRun} AI credits` : "AI credits per run"}</span>
          <span className="text-[12px] text-brand-mute">{s.custom && !s.live ? "Paused" : usage(s)}</span>
        </span>
        {klingit ? (
          s.key === "brand_check_service" ? (
            <span className="text-[12px] text-brand-ink-2">Always on</span>
          ) : (
            <AskKlingit skillId={s.id} skillName={s.name} teamCredits={s.teamCredits} />
          )
        ) : s.custom && !s.live ? (
          <Link href="/skills/yours" className={pillClass("secondary", "sm")}>
            Resume
          </Link>
        ) : (
          <Link href={`/skills/${s.id}`} className={pillClass("primary", "sm")}>
            Use
          </Link>
        )}
      </div>
    </li>
  );
}
