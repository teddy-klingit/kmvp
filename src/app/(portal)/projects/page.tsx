import { FolderKanban, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { loadProjectStates } from "@/lib/project-state-loader";
import { projectRow } from "@/lib/client-home";
import { boardCard, LANES } from "@/lib/projects-board";
import { queuedProjects, slotUsage } from "@/lib/active-slots";
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

function typeLabel(t: string) {
  return PROJECT_TYPE_LABEL[t]?.split(" / ")[0] ?? t;
}

/**
 * Projects (Projects.dc.html, board v2): the client stages as tinted lanes (Drafts, Queued, Active, In review,
 * Delivered) with the active-slot meter, or the same groups as a list. Archived is a filter chip, not a lane.
 */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; show?: string }> }) {
  const { view, q, show } = await searchParams;
  const isList = view === "list";
  const viewer = await getPortalViewer();
  const now = new Date();
  const term = q?.trim();
  const [items, client, slots, queue] = await Promise.all([
    loadProjectStates(
      // AND, never a spread: the visibility rule is itself an OR and must not be overwritten.
      {
        AND: [
          projectVisibilityWhere(viewer.id),
          // Home search: matches project names and their assets' names.
          ...(term ? [{ OR: [{ name: { contains: term } }, { assets: { some: { name: { contains: term } } } }] }] : []),
        ],
      },
      viewer.clientId,
      { dueDate: "asc" }
    ),
    prisma.client.findUniqueOrThrow({ where: { id: viewer.clientId }, include: { accountLead: { include: { user: true } } } }),
    slotUsage(viewer.clientId),
    queuedProjects(viewer.clientId),
  ]);
  const lead = client.accountLead?.user.name ?? null;
  // Queue places count every queued project of the client, so "Next in line" is true even with confidential ones.
  const queueRank = new Map(queue.map((p, i) => [p.id, i + 1]));
  const all = items.map((i) => ({ item: i, card: boardCard(i, { typeLabel, accountLead: lead, queueRank, now }) }));
  const archived = all.filter((x) => x.card.stage === "archived");
  const live = all.filter((x) => x.card.stage !== "archived");
  const needsYou = live.filter((x) => x.card.needsYou);
  const active = show === "you" || show === "archived" ? show : null;
  const shown = active === "archived" ? archived : active === "you" ? needsYou : live;
  const count = (lane: string) => live.filter((x) => x.card.lane === lane).length;

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
    ...(archived.length > 0 ? [{ label: "Archived", href: href({ show: "archived" }), active: active === "archived", count: archived.length }] : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`${count("active")} active · ${count("queued")} queued · ${slots.free} slot${slots.free === 1 ? "" : "s"} free${term ? ` · matching “${term}”` : ""}`}
        title="Projects"
        actions={
          <>
            <PillLink href="/projects/inspiration">Inspiration</PillLink>
            <PillLink href="/brief/new" variant="primary">
              <Plus className="size-3.5" strokeWidth={1.75} />
              New project
            </PillLink>
          </>
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

          {shown.length === 0 ? (
            <EmptyState title="Nothing here." action={<PillLink href={href({ show: null })}>Show all</PillLink>} />
          ) : isList || active === "archived" ? (
            <div className="flex flex-col gap-5">
              {(active === "archived" ? [{ lane: "archived", title: "Archived", hint: "Signed off over 30 days ago, or archived" }] : LANES).map((l) => {
                const group = shown.filter((x) => (l.lane === "archived" ? true : x.card.lane === l.lane));
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
          {!isList && active !== "archived" && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-[13px] text-brand-ink-2">
              <DotLegend items={[{ tone: "you", label: "Needs you" }, { tone: "klingit", label: "Klingit is working" }, { tone: "done", label: "Done" }]} />
              <span className="flex-1" />
              <span>
                Drag a draft to Queued to send it. Your plan runs {slots.total} project{slots.total === 1 ? "" : "s"} at a time.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
