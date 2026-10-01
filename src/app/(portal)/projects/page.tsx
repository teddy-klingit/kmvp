import Link from "next/link";
import { FolderKanban, List, LayoutGrid, Plus, Lock } from "lucide-react";
import { getPortalViewer } from "@/lib/current-viewer";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StageBadge } from "@/components/portal/stage-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ProjectCardMenu } from "@/components/portal/project-card-menu";
import { cn, formatDate } from "@/lib/utils";
import { PROJECT_TYPE_LABEL, PROJECT_TYPE_COLOR } from "@/lib/labels";
import { BOARD_COLUMNS, boardColumnFor, type ProjectState } from "@/lib/project-state";
import { loadProjectStates, type ProjectWithStateData } from "@/lib/project-state-loader";

type BoardItem = { project: ProjectWithStateData; state: ProjectState };

/** Client-turn cards open where the action is; everything else opens the overview. */
function cardHref({ project, state }: BoardItem) {
  return state.ballInCourt === "client" && !state.paused ? state.nextAction.href : `/projects/${project.id}`;
}

function dateLine({ project, state }: BoardItem) {
  if (state.stage === "closed") return project.deliveredAt ? `Delivered ${formatDate(project.deliveredAt)}` : null;
  return state.keyFacts.dueDate ? `Due ${formatDate(state.keyFacts.dueDate)}` : null;
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  const { view, q } = await searchParams;
  const isList = view === "list";
  const viewer = await getPortalViewer();
  const term = q?.trim();
  // Home search: matches project names and their assets' names.
  const projects = await loadProjectStates(
    // AND, never a spread: the visibility rule is itself an OR and must not be overwritten.
    {
      AND: [
        projectVisibilityWhere(viewer.id),
        ...(term ? [{ OR: [{ name: { contains: term } }, { assets: { some: { name: { contains: term } } } }] }] : []),
      ],
    },
    viewer.clientId
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Projects"
        tabs={[
          { label: "All projects", href: "/projects" },
          { label: "Inspiration", href: "/projects/inspiration" },
        ]}
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-border bg-card p-0.5">
              <Link
                href="/projects?view=board"
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  !isList ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutGrid className="size-3.5" />
                Board
              </Link>
              <Link
                href="/projects?view=list"
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  isList ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <List className="size-3.5" />
                List
              </Link>
            </div>
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/projects/new">
                <Plus className="size-3.5" />
                New project
              </Link>
            </Button>
          </div>
        }
      />
      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Every project starts with a brief. Klingit's agents scope, staff, and produce from there."
          actionLabel="Start a brief"
          actionHref="/projects/new"
        />
      ) : isList ? (
        <ProjectsList projects={projects} />
      ) : (
        <ProjectsBoard projects={projects} />
      )}
    </div>
  );
}

function ProjectsBoard({ projects }: { projects: BoardItem[] }) {
  const visibleColumns = BOARD_COLUMNS.filter((col) => {
    const count = projects.filter((p) => boardColumnFor(p.state) === col).length;
    return count > 0 || (col !== "Archived" && col !== "Paused");
  });

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {visibleColumns.map((col) => {
        const items = projects.filter((p) => boardColumnFor(p.state) === col);
        return (
          <div
            key={col}
            data-column={col}
            className="flex w-72 shrink-0 flex-col gap-3 rounded-xl border border-border/60 bg-muted/50 p-3"
          >
            <div className="flex items-center gap-2 px-1">
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{col}</p>
              <span className="flex size-5 items-center justify-center rounded-full bg-card text-[11px] font-medium text-muted-foreground shadow-sm">
                {items.length}
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              {items.length === 0 && (
                <div className="rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
                  Nothing here
                </div>
              )}
              {items.map((item, i) => {
                const { project: p, state } = item;
                const date = dateLine(item);
                return (
                  <Link
                    key={p.id}
                    href={cardHref(item)}
                    className="animate-in fade-in slide-in-from-bottom-1 duration-300"
                    style={{ animationDelay: `${Math.min(i, 6) * 40}ms`, animationFillMode: "backwards" }}
                  >
                    <Card
                      className={cn(
                        "flex flex-col gap-2 border-l-4 bg-card p-4 transition-colors hover:border-ink/30",
                        p.status === "DRAFT" && "border-dashed"
                      )}
                      style={{ borderLeftColor: PROJECT_TYPE_COLOR[p.type] }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-sm font-semibold leading-snug">
                          {p.confidential && <Lock className="size-3 shrink-0 text-muted-foreground" />}
                          {p.name}
                        </p>
                        <ProjectCardMenu projectId={p.id} status={p.status} />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <TypeBadge type={p.type} />
                      </div>
                      {state.stage !== "closed" && (
                        <p
                          className={cn(
                            "text-xs",
                            state.ballInCourt === "client" ? "font-medium text-ink" : "text-muted-foreground"
                          )}
                        >
                          {state.nextAction.label}
                        </p>
                      )}
                      {date && <p className="text-xs text-muted-foreground">{date}</p>}
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProjectsList({ projects }: { projects: BoardItem[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="divide-y divide-border">
        {projects.map((item, i) => {
          const { project: p, state } = item;
          return (
            <div
              key={p.id}
              className="animate-in fade-in flex items-center justify-between gap-4 border-l-4 duration-300 hover:bg-muted/50"
              style={{ animationDelay: `${Math.min(i, 10) * 25}ms`, animationFillMode: "backwards", borderLeftColor: PROJECT_TYPE_COLOR[p.type] }}
            >
              <Link href={cardHref(item)} className="flex flex-1 items-center justify-between gap-4 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    {p.confidential && <Lock className="size-3 shrink-0 text-muted-foreground" />}
                    <p className="text-sm font-semibold">{p.name}</p>
                    <TypeBadge type={p.type} />
                  </div>
                  <p className="text-xs text-muted-foreground">{state.nextAction.label}</p>
                </div>
                <div className="flex items-center gap-6">
                  <p className="text-xs text-muted-foreground">{dateLine(item)}</p>
                  <StageBadge state={state} />
                </div>
              </Link>
              <div className="pr-4">
                <ProjectCardMenu projectId={p.id} status={p.status} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function TypeBadge({ type }: { type: string }) {
  const color = PROJECT_TYPE_COLOR[type];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, white)`, color }}
    >
      {PROJECT_TYPE_LABEL[type]}
    </span>
  );
}
