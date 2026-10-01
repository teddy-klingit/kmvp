import Link from "next/link";
import { FolderKanban, CalendarClock, Lightbulb, ArrowRight, Bell, AlertTriangle, MessageCircleWarning, Clock3, Folder } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { PageHeader } from "@/components/shared/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { StageBadge } from "@/components/portal/stage-badge";
import { formatDate } from "@/lib/utils";
import { loadProjectStates } from "@/lib/project-state-loader";
import { loadAttentionSources, partitionAttention, type AttentionItem } from "@/lib/urgent-matters";

const URGENT_ICON: Record<AttentionItem["kind"], typeof Bell> = {
  project: Folder,
  notification: AlertTriangle,
  suggestion: Clock3,
  escalation: MessageCircleWarning,
};

const INPUT_ICON: Record<AttentionItem["kind"], typeof Bell> = {
  project: Folder,
  notification: Bell,
  suggestion: Lightbulb,
  escalation: MessageCircleWarning,
};

function firstName(name: string) {
  return name.split(" ")[0];
}

function isToday(d: Date) {
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export default async function DashboardPage() {
  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;

  const [projects, scheduledPosts, ownItems] = await Promise.all([
    loadProjectStates({ status: { not: "ARCHIVED" }, ...projectVisibilityWhere(viewer.id) }, clientId, { dueDate: "asc" }),
    prisma.contentPost.findMany({ where: { clientId, status: "PLANNED" }, orderBy: { scheduledDate: "asc" }, take: 20 }),
    prisma.clientCalendarItem.findMany({ where: { clientId }, orderBy: { date: "asc" }, take: 20 }),
  ]);
  const { urgent: urgentMatters, needsInput } = partitionAttention(
    await loadAttentionSources(clientId, viewer.userId, projects)
  );

  const openProjects = projects.filter(({ state }) => state.stage !== "closed" && !state.paused);

  const dueToday = [
    ...openProjects
      .filter(({ state }) => state.keyFacts.dueDate && isToday(state.keyFacts.dueDate))
      .map(({ project: p }) => ({ id: `p-${p.id}`, label: `${p.name} — due today`, href: `/projects/${p.id}` })),
    ...scheduledPosts.filter((c) => c.scheduledDate && isToday(c.scheduledDate)).map((c) => ({ id: `c-${c.id}`, label: `${c.title} — scheduled today (${c.platform})`, href: "/calendar" })),
    ...ownItems.filter((o) => isToday(o.date)).map((o) => ({ id: `o-${o.id}`, label: `${o.title} — today (${o.channel})`, href: "/calendar" })),
  ];

  const upcomingProjects = openProjects.slice(0, 6);
  const actionCount = urgentMatters.length + needsInput.length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Dashboard" />

      <div>
        <h2 className="font-display text-[28px] font-light leading-none tracking-tight text-ink">Good morning, {firstName(viewer.user.name)}.</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {dueToday.length > 0 ? `${dueToday.length} due today · ` : ""}
          {actionCount} {actionCount === 1 ? "thing" : "things"} waiting for your input.
        </p>
      </div>

      {urgentMatters.length > 0 && (
        <Card data-list="urgent" className="flex flex-col gap-3 bg-fade-purple-orange p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-paper text-ink">
              <AlertTriangle className="size-4" />
            </span>
            <div>
              <p className="text-sm font-bold text-ink">
                Urgent matters — {urgentMatters.length} {urgentMatters.length === 1 ? "item needs" : "items need"} attention now
              </p>
              <p className="text-xs text-muted-foreground">Overdue approvals, unanswered complaints, and SLA risks — nothing here should sit.</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {urgentMatters.map((m) => {
              const Icon = URGENT_ICON[m.kind];
              return (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg bg-paper px-4 py-3 text-sm">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <Icon className="mt-0.5 size-3.5 shrink-0 text-ink" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{m.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.detail}</p>
                    </div>
                  </div>
                  <Button asChild size="sm" variant="destructive" className="shrink-0">
                    <Link href={m.href}>{m.actionLabel}</Link>
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <SectionLabel>Due today</SectionLabel>
          {dueToday.length === 0 ? (
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">Nothing due today — you&apos;re clear.</p>
            </Card>
          ) : (
            <Card className="divide-y divide-border p-0">
              {dueToday.map((d) => (
                <Link key={d.id} href={d.href} className="flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-muted/40">
                  <CalendarClock className="size-4 shrink-0 text-ink" />
                  <span className="flex-1">{d.label}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Needs your input</SectionLabel>
          {needsInput.length === 0 ? (
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">
                {urgentMatters.length > 0 ? "Nothing else waiting on you — see urgent matters above." : "Nothing waiting on you right now."}
              </p>
            </Card>
          ) : (
            <Card data-list="needs-input" className="divide-y divide-border p-0">
              {needsInput.map((item) => {
                const Icon = INPUT_ICON[item.kind];
                return (
                  <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <Icon className="mt-0.5 size-3.5 shrink-0 text-ink" />
                      <div className="min-w-0">
                        <p className="font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                    </div>
                    <Button asChild size="sm" variant="secondary" className="shrink-0">
                      <Link href={item.href}>{item.actionLabel}</Link>
                    </Button>
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <SectionLabel>Active projects</SectionLabel>
          <Link href="/projects" className="text-xs font-medium text-ink hover:underline">
            View all
          </Link>
        </div>
        {upcomingProjects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Start your first brief and Klingit's agents will take it from there."
            actionLabel="Start a brief"
            actionHref="/projects/new"
          />
        ) : (
          <Card className="divide-y divide-border p-0">
            {upcomingProjects.map(({ project: p, state }) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors hover:bg-muted/40">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{state.nextAction.label}</span>
                </span>
                <div className="flex shrink-0 items-center gap-3">
                  <StageBadge state={state} />
                  <span className="w-20 text-right text-xs text-muted-foreground">
                    {state.keyFacts.dueDate ? (isToday(state.keyFacts.dueDate) ? "Today" : formatDate(state.keyFacts.dueDate)) : "No due date"}
                  </span>
                </div>
              </Link>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
