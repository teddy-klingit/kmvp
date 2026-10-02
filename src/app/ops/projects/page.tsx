import { Plus } from "lucide-react";
import { requireOpsPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { FilterChips } from "@/components/ds/filter-chips";
import { SectionCard, CardNote } from "@/components/ds/card";
import { DataTable } from "@/components/ds/data-table";
import { StatusPill } from "@/components/ds/status-pill";
import { PillLink } from "@/components/ds/pill-link";
import { formatDate } from "@/lib/utils";
import { PROJECT_STATUS_LABEL } from "@/lib/labels";

const COLUMNS = [
  "BRIEFING",
  "ESTIMATING",
  "STAFFING",
  "IN_PRODUCTION",
  "QA",
  "AWAITING_REVIEW",
  "IN_FEEDBACK",
  "DELIVERED",
] as const;

/** Ops → Projects (OpsClients pattern): every live project across clients, filtered by stage, soonest due first. */
export default async function CrossClientProjectsPage({ searchParams }: { searchParams: Promise<{ q?: string; stage?: string }> }) {
  await requireOpsPage(["ADMIN", "PM"]);
  const { q, stage } = await searchParams;
  const term = q?.trim();
  const projects = await prisma.project.findMany({
    where: {
      status: { notIn: ["ARCHIVED", "DRAFT"] },
      ...(term
        ? {
            OR: [
              { name: { contains: term } },
              { client: { name: { contains: term } } },
              { team: { members: { some: { staffMember: { user: { name: { contains: term } } } } } } },
            ],
          }
        : {}),
    },
    include: { client: true, team: { include: { members: { include: { staffMember: { include: { user: true } } } } } } },
    orderBy: { dueDate: "asc" },
  });

  const byStatus = new Map<string, typeof projects>();
  for (const p of projects) {
    const list = byStatus.get(p.status) ?? [];
    list.push(p);
    byStatus.set(p.status, list);
  }
  const onBoard = COLUMNS.flatMap((s) => byStatus.get(s) ?? []);
  const activeStage = stage && (COLUMNS as readonly string[]).includes(stage) ? stage : undefined;
  const visible = activeStage ? (byStatus.get(activeStage) ?? []) : onBoard;
  const delivered = byStatus.get("DELIVERED")?.length ?? 0;
  const now = new Date();

  const href = (s?: string) => {
    const qs = new URLSearchParams();
    if (term) qs.set("q", term);
    if (s) qs.set("stage", s);
    return `/ops/projects${qs.size ? `?${qs}` : ""}`;
  };

  return (
    <OpsPage>
      <PageHeader
        eyebrow={`${onBoard.length - delivered} in progress · ${delivered} delivered`}
        title={term ? `Projects matching “${term}”` : "Projects"}
        actions={
          <PillLink href="/ops/projects/new" variant="primary">
            <Plus className="size-3.5" strokeWidth={1.75} />
            New
          </PillLink>
        }
      />
      <FilterChips
        label="Filter projects by stage"
        items={[
          { label: "All", href: href(), active: !activeStage, count: onBoard.length },
          ...COLUMNS.map((s) => ({ label: PROJECT_STATUS_LABEL[s], href: href(s), active: activeStage === s, count: byStatus.get(s)?.length ?? 0 })),
        ]}
      />
      <SectionCard title={activeStage ? PROJECT_STATUS_LABEL[activeStage] : "All projects"}>
        <DataTable
          label="Projects"
          empty={<CardNote>No projects {term ? "match this search" : activeStage ? "at this stage" : "yet"}.</CardNote>}
          columns={[
            { key: "project", label: "Project" },
            { key: "stage", label: "Stage" },
            { key: "lead", label: "Team" },
            { key: "due", label: "Due", className: "w-[140px]" },
          ]}
          rows={visible.map((p) => {
            const lead = p.team?.members[0]?.staffMember.user.name.split(" ")[0];
            const overdue = p.dueDate && p.dueDate < now && p.status !== "DELIVERED";
            return {
              id: p.id,
              href: `/ops/projects/${p.id}`,
              cells: {
                project: (
                  <span className="flex flex-col">
                    <span className="text-[15px]">{p.name}</span>
                    <span className="text-[12px] text-brand-ink-2">{p.client.name}</span>
                  </span>
                ),
                stage: <StatusPill tone={p.status === "DELIVERED" ? "success" : "neutral"}>{PROJECT_STATUS_LABEL[p.status]}</StatusPill>,
                lead: lead ?? <span className="text-brand-ink-2">Unassigned</span>,
                due: p.dueDate ? (
                  <span className={overdue ? "text-ds-danger-text" : undefined}>
                    {formatDate(p.dueDate, { day: "numeric", month: "short" })}
                    {overdue ? " · overdue" : ""}
                  </span>
                ) : null,
              },
            };
          })}
        />
      </SectionCard>
    </OpsPage>
  );
}
