import Link from "next/link";
import { FolderKanban, Layers, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { loadProjectStates } from "@/lib/project-state-loader";
import { klingitChatHref, projectRow } from "@/lib/client-home";
import { boardCard, LANES } from "@/lib/projects-board";
import { queuedProjects, slotUsage } from "@/lib/active-slots";
import { planFor } from "@/lib/ai-credits";
import { formatDay } from "@/lib/project-state";
import { PROJECT_TYPE_LABEL } from "@/lib/labels";
import { PageHeader } from "@/components/ds/page-header";
import { SegmentedNav } from "@/components/ds/segmented-control";
import { FilterChips } from "@/components/ds/filter-chips";
import { DotLegend } from "@/components/ds/status-dot";
import { EmptyState } from "@/components/ds/empty-state";
import { Card } from "@/components/ds/card";
import { PillLink } from "@/components/ds/pill-link";
import { ProjectRows } from "@/components/portal/project-rows";
import { ProjectCardMenu } from "@/components/portal/project-card-menu";
import { ProjectsBoard } from "@/components/portal/projects-board";
import { AddSlotDialog } from "@/components/portal/add-slot-dialog";
import { cn } from "@/lib/utils";

function typeLabel(t: string) {
  return PROJECT_TYPE_LABEL[t]?.split(" / ")[0] ?? t;
}

/**
 * Ongoing projects (nav v3, 06): Drafts → Queued → Active → In review, the plan's active slots above (in use =
 * the Active column), filters All · Needs you · Finished · Archived. Delivered work leaves the board: its files are
 * in the Output library, the project under Finished.
 */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; show?: string }> }) {
  const { view, q, show } = await searchParams;
  const isList = view === "list";
  const viewer = await getPortalViewer();
  const now = new Date();
  const term = q?.trim();
  const [items, client, slots, queue, chat] = await Promise.all([
    loadProjectStates(
      // AND, never a spread: the visibility rule is itself an OR and must not be overwritten.
      { AND: [projectVisibilityWhere(viewer.id), { agentBuild: false }, ...(term ? [{ OR: [{ name: { contains: term } }, { assets: { some: { name: { contains: term } } } }] }] : [])] },
      viewer.clientId,
      { dueDate: "asc" }
    ),
    prisma.client.findUniqueOrThrow({ where: { id: viewer.clientId }, include: { accountLead: { include: { user: true } } } }),
    slotUsage(viewer.clientId),
    queuedProjects(viewer.clientId),
    klingitChatHref(viewer.clientId),
  ]);
  const plan = await planFor(client.planTier);
  const lead = client.accountLead?.user.name ?? null;
  // Queue places count every queued project of the client, so "Next in line" is true even with confidential ones.
  const queueRank = new Map(queue.map((p, i) => [p.id, i + 1]));
  const all = items.map((i) => ({ item: i, card: boardCard(i, { typeLabel, accountLead: lead, queueRank, now }) }));
  const archived = all.filter((x) => x.item.project.status === "ARCHIVED");
  const finished = all.filter((x) => x.item.project.status === "DELIVERED");
  const live = all.filter((x) => x.card.stage !== "archived" && x.card.stage !== "delivered" && x.item.project.status !== "ARCHIVED");
  const needsYou = live.filter((x) => x.card.needsYou);
  const active = show === "you" || show === "finished" || show === "archived" ? show : null;
  const shown = active === "archived" ? archived : active === "finished" ? finished : active === "you" ? needsYou : live;
  const finishedThisYear = finished.filter((x) => x.item.project.deliveredAt && x.item.project.deliveredAt.getFullYear() === now.getFullYear()).length;

  // When the next slot frees: the soonest first draft (or due date) among projects in Active.
  const activeItems = live.filter((x) => x.card.lane === "active");
  const next = activeItems
    .map((x) => ({ name: x.item.project.name, at: x.item.state.keyFacts.firstDraftEta ?? x.item.state.keyFacts.dueDate }))
    .filter((x): x is { name: string; at: Date } => Boolean(x.at))
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
  const queued = live.filter((x) => x.card.lane === "queued").length;
  const slotNote = [queued ? `${queued} project${queued === 1 ? "" : "s"} queued.` : "Nothing queued.", slots.free === 0 && next ? `Next slot frees ~${formatDay(next.at)} when ${next.name} goes to review.` : slots.free > 0 ? `${slots.free} slot${slots.free === 1 ? "" : "s"} free.` : null].filter(Boolean).join(" ");

  const href = (o: { view?: string; show?: string | null }) => {
    const qs = new URLSearchParams();
    const v = o.view !== undefined ? o.view : isList ? "list" : undefined;
    const sh = o.show !== undefined ? o.show : active;
    if (v) qs.set("view", v);
    if (sh) qs.set("show", sh);
    if (term) qs.set("q", term);
    return `/projects${qs.size ? `?${qs}` : ""}`;
  };
  const chips = [
    { label: "All", href: href({ show: null }), active: !active },
    { label: "Needs you", href: href({ show: "you" }), active: active === "you", count: needsYou.length },
    { label: "Finished", href: href({ show: "finished" }), active: active === "finished" },
    { label: "Archived", href: href({ show: "archived" }), active: active === "archived" },
  ];
  const listOnly = isList || active === "finished" || active === "archived";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`${live.length} project${live.length === 1 ? "" : "s"} · ${needsYou.length} need${needsYou.length === 1 ? "s" : ""} you${term ? ` · matching “${term}”` : ""}`}
        title="Ongoing projects"
        actions={
          <PillLink href="/brief/new" variant="primary">
            <Plus className="size-3.5" strokeWidth={1.75} />
            New project
          </PillLink>
        }
      />

      {items.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects yet. Every project starts with a brief." action={<PillLink href="/brief/new" variant="primary">Start a brief</PillLink>} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <SegmentedNav
              label="Projects view"
              items={[
                { label: "Board", href: href({ view: "" }), active: !isList },
                { label: "List", href: href({ view: "list" }), active: isList },
              ]}
            />
            <FilterChips label="Filter projects" items={chips} />
          </div>

          {!active && (
            <Card className="flex flex-wrap items-center gap-x-8 gap-y-3 px-6 py-4" aria-label="Active slots">
              <span className="flex flex-col">
                <span className="text-[16px]">Active slots</span>
                <span className="text-[13px] text-brand-ink-2">
                  {plan.name || "Your"} plan includes {slots.total}
                </span>
              </span>
              <span className="flex items-center gap-1.5" aria-hidden>
                {Array.from({ length: Math.max(slots.total, slots.used) }, (_, i) => (
                  <span key={i} className={cn("h-2 w-14 rounded-full", i < slots.used ? "bg-brand-ink" : "border border-dashed border-brand-mute")} />
                ))}
              </span>
              <span className="text-[15px]">
                {slots.used} of {slots.total} in use
              </span>
              <span className="min-w-[220px] flex-1 text-[14px] text-brand-ink-2">{slotNote}</span>
              <AddSlotDialog planName={plan.name || "current"} slots={slots.total} contactHref={chat} />
            </Card>
          )}

          {shown.length === 0 ? (
            <EmptyState title={active === "finished" ? "Nothing finished yet." : "Nothing here."} action={<PillLink href={href({ show: null })}>Show all</PillLink>} />
          ) : listOnly ? (
            <div className="flex flex-col gap-5">
              {(active === "archived" ? [{ lane: "archived", title: "Archived", hint: "Archived projects" }] : active === "finished" ? [{ lane: "finished", title: "Finished", hint: "Delivered · files are in the Output library" }] : LANES).map((l) => {
                const group = shown.filter((x) => (l.lane === "archived" || l.lane === "finished" ? true : x.card.lane === l.lane));
                if (group.length === 0) return null;
                return (
                  <section key={l.lane} aria-label={l.title} data-section={l.title} className="flex flex-col gap-2">
                    <div className="flex items-baseline gap-2 px-1">
                      <h2 className="m-0 text-[15px] font-semibold">{l.title}</h2>
                      <span className="text-[13px] text-brand-ink-2">{group.length}</span>
                      <span className="text-[12px] text-brand-ink-2">· {l.hint}</span>
                    </div>
                    <Card className="@container/col overflow-hidden">
                      <ProjectRows rows={group.map((x) => projectRow(x.item, typeLabel, lead, now))} menu={(r) => <ProjectCardMenu projectId={r.id} status={r.projectStatus} />} />
                    </Card>
                  </section>
                );
              })}
            </div>
          ) : (
            <ProjectsBoard cards={shown.map((x) => x.card)} slots={{ total: slots.total, used: slots.used }} />
          )}

          {!active && (
            <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[12px] border border-dashed border-brand-field px-5 py-3.5 text-[14px] text-brand-ink-2">
              <Layers className="size-4 shrink-0" strokeWidth={1.75} />
              <span className="min-w-0 flex-1">
                Delivered work leaves this board. Its files go to the{" "}
                <Link href="/library" className="text-brand-ink underline underline-offset-2">
                  Output library
                </Link>
                ; the project itself is under Finished.
              </span>
              <span className="font-brand-mono text-[12px] uppercase text-brand-ink">{finishedThisYear} finished this year</span>
            </p>
          )}
          {!isList && !active && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-[13px] text-brand-ink-2">
              <DotLegend items={[{ tone: "you", label: "Needs you" }, { tone: "klingit", label: "Klingit is working" }, { tone: "paused", label: "Waiting" }]} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
