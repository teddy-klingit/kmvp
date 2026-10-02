import Link from "next/link";
import { FolderKanban, Lock, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { loadProjectStates } from "@/lib/project-state-loader";
import { CLIENT_COLUMNS, clientColumnFor } from "@/lib/project-state";
import { projectRow, type ProjectRowData } from "@/lib/client-home";
import { PROJECT_TYPE_LABEL } from "@/lib/labels";
import { PageHeader } from "@/components/ds/page-header";
import { SegmentedNav } from "@/components/ds/segmented-control";
import { FilterChips } from "@/components/ds/filter-chips";
import { AvatarStack } from "@/components/ds/avatar";
import { StatusDot, DotLegend } from "@/components/ds/status-dot";
import { EmptyState } from "@/components/ds/empty-state";
import { Card } from "@/components/ds/card";
import { PillLink } from "@/components/ds/pill-link";
import { ProjectRows } from "@/components/portal/project-rows";
import { ProjectCardMenu } from "@/components/portal/project-card-menu";
import { cn } from "@/lib/utils";

type Show = "you" | "klingit" | "delivered" | "archived";

function typeLabel(t: string) {
  return PROJECT_TYPE_LABEL[t]?.split(" / ")[0] ?? t;
}

/** Which filter chip a row belongs to. Paused counts as Klingit's (nothing waits on the client). */
function bucket(r: ProjectRowData): Show {
  if (r.status.label === "Archived") return "archived";
  if (r.status.tone === "done") return "delivered";
  return r.status.tone === "you" ? "you" : "klingit";
}

/**
 * Projects (Projects.dc.html): a board with the client timeline's five columns, or the same projects as
 * Home's rows. Board/List is the page's one segmented control; status filters are chips.
 */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; show?: string }> }) {
  const { view, q, show } = await searchParams;
  const isList = view === "list";
  const viewer = await getPortalViewer();
  const now = new Date();
  const term = q?.trim();
  const [items, client] = await Promise.all([
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
  ]);
  const lead = client.accountLead?.user.name ?? null;
  const rows = items.map((i) => ({ row: projectRow(i, typeLabel, lead, now), column: clientColumnFor(i.state) }));
  const count = (s: Show) => rows.filter((r) => bucket(r.row) === s).length;
  const active: Show | null = show === "you" || show === "klingit" || show === "delivered" || show === "archived" ? show : null;
  const visible = rows.filter((r) => (active ? bucket(r.row) === active : bucket(r.row) !== "archived"));
  const live = rows.filter((r) => bucket(r.row) !== "archived");

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
    { label: "Waiting on you", href: href({ show: "you" }), active: active === "you", count: count("you") },
    { label: "Klingit working", href: href({ show: "klingit" }), active: active === "klingit", count: count("klingit") },
    { label: "Delivered", href: href({ show: "delivered" }), active: active === "delivered" },
    ...(count("archived") > 0 ? [{ label: "Archived", href: href({ show: "archived" }), active: active === "archived", count: count("archived") }] : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`${live.length} project${live.length === 1 ? "" : "s"} · ${count("you")} waiting on you${term ? ` · matching “${term}”` : ""}`}
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
            <FilterChips label="Filter by status" items={chips} />
          </div>

          {isList ? (
            visible.length === 0 ? (
              <EmptyState title="Nothing here." action={<PillLink href={href({ show: null })}>Show all</PillLink>} />
            ) : (
              <Card className="@container/col overflow-hidden">
                <ProjectRows rows={visible.map((r) => r.row)} menu={(r) => <ProjectCardMenu projectId={r.id} status={r.projectStatus} />} />
              </Card>
            )
          ) : (
            <Board rows={visible} archived={active === "archived"} />
          )}
          {!isList && <DotLegend items={[{ tone: "you", label: "Waiting on you" }, { tone: "klingit", label: "Klingit is working" }, { tone: "done", label: "Done" }]} />}
        </>
      )}
    </div>
  );
}

function Board({ rows, archived }: { rows: { row: ProjectRowData; column: string | null }[]; archived: boolean }) {
  // Archived projects aren't on the timeline: show them as one plain column.
  const columns = archived ? ["Archived"] : CLIENT_COLUMNS;
  return (
    // Under ~1000px of content the columns keep their width and the board scrolls inside itself, never the page.
    <div className="-mx-4 overflow-x-auto px-4 pb-2 min-[900px]:mx-0 min-[900px]:px-0">
      <div className={cn("grid gap-4", archived ? "max-w-[300px] grid-cols-1" : "min-w-[1000px] grid-cols-5")}>
        {columns.map((col) => {
          const items = rows.filter((r) => (archived ? true : r.column === col));
          return (
            <section key={col} aria-label={col} data-column={col} className="flex min-w-0 flex-col gap-3">
              <div className="flex items-baseline justify-between px-1.5">
                <h2 className="m-0 text-[15px] font-normal">{col}</h2>
                <span className="font-brand-mono text-[12px] text-brand-ink-2">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <div className="flex h-[120px] items-center justify-center rounded-[12px] border border-dashed border-brand-outline text-[13px] text-brand-ink-2">Nothing here</div>
              ) : (
                items.map(({ row }) => <BoardCard key={row.id} row={row} />)
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function BoardCard({ row }: { row: ProjectRowData }) {
  return (
    <article className={cn("relative flex flex-col gap-3.5 rounded-[12px] bg-white p-4 hover:shadow-[0_2px_10px_rgba(30,30,30,0.06)]", row.draft && "border border-dashed border-brand-outline")}>
      <div className="flex min-w-0 flex-col gap-0.5 pr-7">
        <Link href={row.href} className="flex min-w-0 items-start gap-1.5 text-[15px] leading-[1.35] text-brand-ink no-underline after:absolute after:inset-0 after:rounded-[12px] after:content-['']">
          {row.confidential && <Lock aria-label="Confidential" className="mt-1 size-3.5 shrink-0 text-brand-ink-2" />}
          <span className="min-w-0">{row.name}</span>
        </Link>
        <span className="text-[13px] text-brand-ink-2">{row.draft ? `${row.type} · draft` : row.type}</span>
      </div>
      <StatusDot tone={row.cardStatus.tone}>{row.cardStatus.label}</StatusDot>
      <div className="flex items-center justify-between gap-2">
        <span className="font-brand-mono text-[11px] text-brand-ink">{row.dateLabel}</span>
        {row.team.length > 0 && <AvatarStack names={row.team} size={24} max={3} overlap={4} />}
      </div>
      <span className="absolute right-2 top-2 z-10">
        <ProjectCardMenu projectId={row.id} status={row.projectStatus} />
      </span>
    </article>
  );
}
