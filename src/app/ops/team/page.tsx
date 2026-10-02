import { requireOpsPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { jsonArray } from "@/lib/utils";
import { INTERNAL_ROLE_LABEL } from "@/lib/labels";
import { FilterChips } from "@/components/ds/filter-chips";
import { SectionCard, CardNote } from "@/components/ds/card";
import { DataTable } from "@/components/ds/data-table";
import { StatusPill } from "@/components/ds/status-pill";
import { Meter } from "@/components/ds/stats";
import { Avatar } from "@/components/ds/avatar";

/** Ops → Team → Capacity (OpsClients pattern): who is on what this week, and how full they are. Over 90% is flagged. */
export default async function TeamRosterPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireOpsPage(["ADMIN", "PM"]);
  const { show } = await searchParams;
  const staff = await prisma.staffMember.findMany({
    include: { user: true, teamMemberships: { include: { team: { include: { project: { include: { client: true } } } } } } },
    orderBy: { createdAt: "asc" },
  });
  const rows = staff.map((s) => {
    const active = s.teamMemberships.filter((m) => m.team.project.status !== "ARCHIVED" && m.team.project.status !== "DELIVERED");
    const hours = active.reduce((sum, m) => sum + m.allocatedHours, 0);
    const pct = s.capacityHoursPerWeek > 0 ? Math.round((hours / s.capacityHoursPerWeek) * 100) : 0;
    return { s, active, hours, pct };
  });
  const full = rows.filter((r) => r.pct > 90).length;
  const free = rows.filter((r) => r.active.length === 0).length;
  const visible = show === "full" ? rows.filter((r) => r.pct > 90) : show === "free" ? rows.filter((r) => r.active.length === 0) : rows;

  return (
    <>
      <FilterChips
        label="Filter team"
        items={[
          { label: "All", href: "/ops/team", active: !show },
          { label: "Over 90%", href: "/ops/team?show=full", active: show === "full", count: full },
          { label: "Unassigned", href: "/ops/team?show=free", active: show === "free", count: free },
        ]}
      />
      <SectionCard title="Capacity this week">
        <DataTable
          label="Team capacity"
          empty={<CardNote>Nobody matches this filter.</CardNote>}
          columns={[
            { key: "person", label: "Person" },
            { key: "skills", label: "Skills" },
            { key: "load", label: "Allocated", className: "w-[220px]" },
            { key: "work", label: "Assignments" },
          ]}
          rows={visible.map(({ s, active, hours, pct }) => ({
            id: s.id,
            cells: {
              person: (
                <span className="flex items-center gap-3">
                  <Avatar name={s.user.name} size={32} />
                  <span className="flex flex-col">
                    <span className="text-[15px]">{s.user.name}</span>
                    <span className="text-[12px] text-brand-ink-2">{INTERNAL_ROLE_LABEL[s.title]}</span>
                  </span>
                </span>
              ),
              skills: (
                <span className="flex flex-wrap gap-1">
                  {jsonArray<string>(s.brandFitTags).map((t) => (
                    <StatusPill key={t}>{t}</StatusPill>
                  ))}
                </span>
              ),
              load: (
                <span className="flex flex-col gap-1.5">
                  <span className="flex justify-between text-[13px] tabular-nums">
                    <span className="text-brand-ink-2">
                      {hours}h of {s.capacityHoursPerWeek}h
                    </span>
                    {pct > 90 ? <StatusPill tone="watch">{pct}%</StatusPill> : <span>{pct}%</span>}
                  </span>
                  <Meter value={hours} max={s.capacityHoursPerWeek} label={`${pct}% allocated`} />
                </span>
              ),
              work:
                active.length === 0 ? (
                  <span className="text-brand-ink-2">No active assignments</span>
                ) : (
                  <span className="flex flex-col gap-0.5 text-[13px]">
                    {active.map((m) => (
                      <span key={m.id}>
                        {m.team.project.client.name} · {m.team.project.name}
                      </span>
                    ))}
                  </span>
                ),
            },
          }))}
        />
      </SectionCard>
    </>
  );
}
