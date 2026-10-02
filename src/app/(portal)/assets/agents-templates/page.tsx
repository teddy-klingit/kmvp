import Link from "next/link";
import { Asterisk, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { SectionCard, CardNote, CardRows } from "@/components/ds/card";
import { PageGrid } from "@/components/ds/page-grid";
import { FilterChips } from "@/components/ds/filter-chips";
import { StatusDot } from "@/components/ds/status-dot";
import { monoLink } from "@/components/ds/pill-link";
import { pillClass } from "@/components/ds/button";
import { CustomAgentRequest } from "@/components/portal/agents/custom-agent-request";
import { requestAgentBuildAction } from "@/lib/actions/agent-request-actions";
import { loadBrandHealth, healthTone } from "@/lib/brand-health";
import { loadProjectStates } from "@/lib/project-state-loader";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { formatDay, shortDate, type ProjectState } from "@/lib/project-state";
import { cn } from "@/lib/utils";

type Category = "Copy" | "Visual" | "Social" | "Briefs";
const CATEGORIES: Category[] = ["Copy", "Visual", "Social", "Briefs"];

/** How each self-service agent reads to a client: a short name, its category and one line. */
const SELF_SERVICE: Record<string, { name: string; category: Category; line: string }> = {
  ad_gen: { name: "Ad gen", category: "Visual", line: "Finished ad with headline and CTA on the image, plus a caption" },
  brief_generator_agent: { name: "Brief generator", category: "Briefs", line: "A ready-to-use creative brief from one line" },
  email_copy_agent: { name: "Email copy", category: "Copy", line: "Subject lines, preheader and body copy" },
  image_gen_agent: { name: "Image gen", category: "Visual", line: "An on-brand image or illustration, no text" },
  instagram_caption_agent: { name: "Instagram caption", category: "Social", line: "Caption, hashtags and alt text for a post" },
  landing_page_copy_agent: { name: "Landing page copy", category: "Copy", line: "Headline, sections and CTA for a landing page" },
  linkedin_post_agent: { name: "LinkedIn post", category: "Social", line: "A ready-to-post update in your brand voice" },
};

const TINT: Record<Category, string> = { Visual: "bg-brand-lime-pale", Briefs: "bg-brand-pink-pale", Copy: "bg-brand-peach-pale", Social: "bg-brand-lavender-pale" };

const RECOMMENDED = [
  { name: "Seasonal content agent", tag: "Seasonal planning", detail: "Learns your Q1–Q4 patterns and drafts seasonal briefs 6 weeks ahead." },
  { name: "Influencer brief agent", tag: "New workflow", detail: "Structured influencer briefs with your tone, do's and don'ts, and disclosure rules." },
];

const BUILD_STEPS = ["Request", "Scoping", "Building", "Testing", "Live"];

/** Request → Scoping → Building → Testing → Live, from the build project's own client stage. */
function buildStep(state: ProjectState) {
  if (state.clientStage === "delivered" || state.clientStage === "archived") return 5;
  if (state.clientStage === "in_review") return 4;
  if (state.clientStage === "active") return 3;
  return state.stage === "briefing" ? 1 : 2;
}

/**
 * Brand OS → Agents & templates → Agents (AgentsTemplates.dc.html): the self-service agents with a category
 * filter inside their card, the client's own agents; on the side brand health, builds under way, what Klingit
 * recommends and a custom request. Templates and Brand OS rules are their own sub-tabs.
 */
export default async function AgentsTemplatesPage({ searchParams }: { searchParams: Promise<{ cat?: string; all?: string }> }) {
  const { cat, all } = await searchParams;
  const viewer = await getPortalViewer();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [selfService, selfRuns, clientRuns, health, builds] = await Promise.all([
    prisma.agent.findMany({ where: { selfService: true, status: "LIVE" }, orderBy: { name: "asc" } }),
    prisma.agentRun.groupBy({ by: ["agentId"], where: { clientId: viewer.clientId, requestedByUserId: { not: null } }, _count: true }),
    prisma.agentRun.findMany({ where: { clientId: viewer.clientId, agent: { selfService: false } }, select: { agentId: true, createdAt: true, agent: true }, orderBy: { createdAt: "desc" } }),
    loadBrandHealth(viewer.clientId),
    loadProjectStates({ agentBuild: true, status: { not: "ARCHIVED" }, ...projectVisibilityWhere(viewer.id) }, viewer.clientId, { createdAt: "desc" }),
  ]);
  const monthRuns = await prisma.agentRun.groupBy({ by: ["agentId"], where: { clientId: viewer.clientId, requestedByUserId: { not: null }, createdAt: { gte: monthStart } }, _count: true });

  const category: Category | null = CATEGORIES.find((c) => c.toLowerCase() === cat) ?? null;
  const rows = selfService
    .map((a) => ({ agent: a, copy: SELF_SERVICE[a.key] ?? { name: a.name.replace(/\s+agent$/i, ""), category: "Copy" as Category, line: a.description } }))
    .filter((r) => !category || r.copy.category === category)
    .sort((a, b) => a.copy.name.localeCompare(b.copy.name));
  const usage = (agentId: string) => {
    const month = monthRuns.find((r) => r.agentId === agentId)?._count ?? 0;
    const total = selfRuns.find((r) => r.agentId === agentId)?._count ?? 0;
    return month ? `Used ${month}× this month` : total ? `Used ${total}×` : "Not used yet";
  };

  // Your agents: the agents that run for this client (with their real count and last run), and builds now live.
  const byAgent = new Map<string, { name: string; description: string; live: boolean; count: number; last: Date }>();
  for (const r of clientRuns) {
    const cur = byAgent.get(r.agentId);
    if (cur) cur.count++;
    else byAgent.set(r.agentId, { name: r.agent.name, description: r.agent.description, live: r.agent.status === "LIVE", count: 1, last: r.createdAt });
  }
  const live = builds.filter((b) => buildStep(b.state) === 5);
  const yours = [
    ...live.map((b) => ({ id: b.project.id, href: `/projects/${b.project.id}`, name: b.project.name, description: "Built for you by Klingit", live: true, meta: b.project.deliveredAt ? `Live since ${shortDate(b.project.deliveredAt)}` : "Live" })),
    ...[...byAgent].map(([id, a]) => ({ id, href: `/assets/agents-templates/agent/${id}`, name: a.name, description: a.description, live: a.live, meta: `Run ${a.count}× · last ${shortDate(a.last)}` })),
  ];
  const shownYours = all ? yours : yours.slice(0, 3);
  const building = builds.filter((b) => buildStep(b.state) < 5);
  const requested = new Set(builds.map((b) => b.project.name));
  const chipHref = (c: Category | null) => `/assets/agents-templates${c ? `?cat=${c.toLowerCase()}` : ""}`;

  return (
    <PageGrid
      main={
        <>
          <SectionCard title="Use an agent yourself" action={<span className="text-[12px] text-brand-ink-2">{selfService.length} ready</span>}>
            <div className="flex flex-col gap-4 px-6 pt-5">
              <div className="flex items-start gap-3">
                <span className="shrink-0 rounded-full bg-brand-lime-pale px-2.5 py-1 text-[12px]">Self-service</span>
                <p className="m-0 text-[14px] leading-[1.5] text-brand-ink-2">Run these yourself, no account manager needed. Each one already knows your brand. Credits come from your plan.</p>
              </div>
              <FilterChips label="Agent category" items={[{ label: "All", href: chipHref(null), active: !category }, ...CATEGORIES.map((c) => ({ label: c, href: chipHref(c), active: category === c }))]} />
            </div>
            {rows.length === 0 ? (
              <CardNote>No {category?.toLowerCase()} agents yet.</CardNote>
            ) : (
              <CardRows className="pt-2">
                {rows.map(({ agent, copy }) => (
                  <li key={agent.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
                    <span aria-hidden className={cn("flex size-11 shrink-0 items-center justify-center rounded-full text-brand-ink", TINT[copy.category])}>
                      <Asterisk className="size-5" strokeWidth={1.5} />
                    </span>
                    <span className="flex min-w-0 flex-1 basis-[220px] flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[16px]">{copy.name}</span>
                        <span className="rounded-full bg-brand-chip px-2 py-0.5 text-[12px] text-brand-ink-2">{copy.category}</span>
                      </span>
                      <span className="text-[14px] leading-[1.45] text-brand-ink-2">{copy.line}</span>
                    </span>
                    <span className="ml-auto flex items-center gap-4">
                      <span className="whitespace-nowrap text-[13px] text-brand-mute">{usage(agent.id)}</span>
                      <Link href={`/assets/agents-templates/agent/${agent.id}`} className={pillClass("primary", "sm")}>
                        Run
                      </Link>
                    </span>
                  </li>
                ))}
              </CardRows>
            )}
          </SectionCard>

          <SectionCard
            title="Your agents"
            meta={yours.length > 0 ? <span className="text-[13px] text-brand-ink-2">{yours.length}</span> : undefined}
            action={yours.length > 3 ? <Link href={all ? "/assets/agents-templates" : "/assets/agents-templates?all=1"} className={monoLink}>{all ? "Show fewer" : `All ${yours.length}`}</Link> : undefined}
          >
            {yours.length === 0 ? (
              <CardNote>No agents have run for you yet. Ask Klingit to build one on the right.</CardNote>
            ) : (
              <CardRows>
                {shownYours.map((a) => (
                  <li key={a.id}>
                    <Link href={a.href} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-6 py-4 text-brand-ink no-underline transition-colors hover:bg-brand-chip">
                      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-chip">
                        <Asterisk className="size-4" strokeWidth={1.5} />
                      </span>
                      <span className="flex min-w-0 flex-1 basis-[200px] flex-col gap-0.5">
                        <span className="text-[16px]">{a.name}</span>
                        <span className="truncate text-[14px] text-brand-ink-2">{a.description}</span>
                      </span>
                      <StatusDot tone={a.live ? "done" : "paused"}>{a.live ? "Live" : "Paused"}</StatusDot>
                      <span className="min-w-[140px] text-right text-[13px] text-brand-mute">{a.meta}</span>
                      <ChevronRight className="size-4 shrink-0 text-brand-ink-2" strokeWidth={1.75} />
                    </Link>
                  </li>
                ))}
              </CardRows>
            )}
          </SectionCard>
        </>
      }
      side={
        <>
          <SectionCard title="Brand health" action={<Link href="/assets" className={monoLink}>Details</Link>}>
            <div className="flex flex-col gap-3 px-6 py-5">
              <div className="flex items-baseline gap-2">
                <span className="text-[44px] font-light leading-none tabular-nums">{health.score}</span>
                <span className="text-[16px]">{health.label}</span>
                <span className="flex-1" />
                <span className="text-[13px] text-brand-mute">of 100</span>
              </div>
              {health.biggestLift && <p className="m-0 text-[14px] leading-[1.5] text-brand-ink-2">{health.biggestLift.line}</p>}
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {health.dimensions.map((d) => {
                  const tone = healthTone(d.share);
                  return (
                    <li key={d.key} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] items-center gap-3 text-[14px]" title={d.counts}>
                      <span className="truncate">{d.name}</span>
                      <span className="h-1 rounded-full bg-brand-line">
                        <span className={cn("block h-full rounded-full", tone === "lime" ? "bg-brand-lime-strong" : tone === "ink" ? "bg-brand-ink" : "bg-brand-orange")} style={{ width: `${Math.max(4, d.share * 100)}%` }} />
                      </span>
                      <span className="text-[13px] tabular-nums text-brand-ink-2">
                        {d.done}/{d.total}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <Link href="/assets" className="self-start text-[14px] text-brand-ink underline underline-offset-4">
                Improve Brand OS
              </Link>
            </div>
          </SectionCard>

          <SectionCard title="Being built for you" action={<span className="text-[13px] text-brand-ink-2">{building.length}</span>}>
            {building.length === 0 ? (
              <CardNote>Nothing being built right now. Request one below and it starts like any project.</CardNote>
            ) : (
              <CardRows>
                {building.map(({ project, state }) => {
                  const step = buildStep(state);
                  const eta = state.keyFacts.firstDraftEta;
                  return (
                    <li key={project.id}>
                      <Link href={`/projects/${project.id}`} className="flex flex-col gap-2 px-6 py-4 text-brand-ink no-underline hover:bg-brand-chip">
                        <span className="flex items-baseline gap-2">
                          <span className="flex-1 text-[15px]">{project.name}</span>
                          <span className="text-[13px] text-brand-ink-2">{BUILD_STEPS[step - 1]}</span>
                        </span>
                        <span className="h-1 rounded-full bg-brand-line">
                          <span className="block h-full rounded-full bg-brand-ink" style={{ width: `${(step / 5) * 100}%` }} />
                        </span>
                        <span className="text-[13px] text-brand-mute">
                          Step {step} of 5{step === 3 && eta ? ` · test version ${formatDay(eta)}` : state.ballInCourt === "client" ? " · waiting on you" : ""}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </CardRows>
            )}
          </SectionCard>

          <SectionCard title="Klingit recommends">
            <CardRows>
              {RECOMMENDED.map((r) => (
                <li key={r.name} className="flex flex-col gap-2.5 px-6 py-4">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="flex-1 text-[15px]">{r.name}</span>
                    <span className="rounded-full bg-brand-lime-pale px-2.5 py-0.5 text-[12px]">{r.tag}</span>
                  </span>
                  <span className="text-[14px] leading-[1.5] text-brand-ink-2">{r.detail}</span>
                  {requested.has(r.name) ? (
                    <span className="text-[13px] text-brand-mute">Requested · see Being built for you</span>
                  ) : (
                    <form action={requestAgentBuildAction}>
                      <input type="hidden" name="name" value={r.name} />
                      <input type="hidden" name="description" value={r.detail} />
                      <button type="submit" className={pillClass("secondary", "sm")}>
                        Request build
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </CardRows>
          </SectionCard>

          <SectionCard title="Something else?">
            <div className="flex flex-col gap-4 px-6 py-5">
              <p className="m-0 text-[14px] leading-[1.5] text-brand-ink-2">Need something else? Describe it and Klingit builds an agent for you.</p>
              <CustomAgentRequest />
            </div>
          </SectionCard>
        </>
      }
    />
  );
}
