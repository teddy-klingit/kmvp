import Link from "next/link";
import { requireOpsPage } from "@/lib/authz";
import { loadWorkload, SQUAD_BUSY_FACTOR } from "@/lib/workload";
import { SectionCard, CardNote } from "@/components/ds/card";
import { DataTable } from "@/components/ds/data-table";
import { StatusPill } from "@/components/ds/status-pill";
import { Meter } from "@/components/ds/stats";
import { Avatar } from "@/components/ds/avatar";

const n = (x: number) => x.toLocaleString("en-GB", { maximumFractionDigits: 1 });

/** Ops → Team → Workload (Phase S, S7.9): per PM and per squad, this month. */
export default async function TeamWorkloadPage() {
  await requireOpsPage(["ADMIN", "PM"]);
  const { pms, squads, period } = await loadWorkload();
  const month = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(`${period}-01T12:00:00`));

  return (
    <>
      <SectionCard title={`Per PM · ${month}`}>
        <DataTable
          label="Workload per PM"
          empty={<CardNote>No PMs yet.</CardNote>}
          columns={[
            { key: "pm", label: "PM" },
            { key: "clients", label: "Clients" },
            { key: "pm_credits", label: "PM credits used of sold", className: "w-[220px]" },
            { key: "creative", label: "Creative booked" },
            { key: "projects", label: "Active projects" },
            { key: "warn", label: "" },
          ]}
          rows={pms.map((p) => ({
            id: p.staffId,
            cells: {
              pm: (
                <span className="flex items-center gap-3">
                  <Avatar name={p.name} size={32} />
                  <span className="flex flex-col">
                    <span className="text-[15px]">{p.name}</span>
                    <span className="text-[12px] text-brand-ink-2 tabular-nums">
                      {p.hours}h of {p.capacity}h a week
                    </span>
                  </span>
                </span>
              ),
              clients:
                p.clients.length === 0 ? (
                  <span className="text-brand-ink-2">None</span>
                ) : (
                  <span className="flex flex-col gap-0.5 text-[13px]">
                    {p.clients.map((c) => (
                      <Link key={c.id} href={`/ops/clients/${c.id}/balances`}>
                        {c.name}
                      </Link>
                    ))}
                  </span>
                ),
              pm_credits:
                p.pmSold > 0 ? (
                  <span className="flex flex-col gap-1.5">
                    <span className="text-[13px] tabular-nums">
                      {n(p.pmUsed)} of {n(p.pmSold)}
                    </span>
                    <Meter value={Math.min(p.pmUsed, p.pmSold)} max={p.pmSold} label={`${n(p.pmUsed)} of ${n(p.pmSold)} PM credits used`} />
                  </span>
                ) : (
                  <span className="text-[13px] text-brand-ink-2">{p.pmUsed > 0 ? `${n(p.pmUsed)} used · none sold` : "No PM pack"}</span>
                ),
              creative: <span className="tabular-nums">{n(p.creativeBooked)}</span>,
              projects: <span className="tabular-nums">{p.activeProjects}</span>,
              warn:
                p.warnings.length === 0 ? (
                  <span className="text-[12px] text-brand-ink-2">OK</span>
                ) : (
                  <span className="flex flex-col items-start gap-1">
                    {p.warnings.map((w) => (
                      <StatusPill key={w} tone="watch">
                        {w}
                      </StatusPill>
                    ))}
                  </span>
                ),
            },
          }))}
        />
      </SectionCard>

      <SectionCard title={`Per squad · ${month}`}>
        <DataTable
          label="Workload per squad"
          empty={<CardNote>No creative credits booked in the last four months.</CardNote>}
          columns={[
            { key: "squad", label: "Squad" },
            { key: "booked", label: "Creative booked" },
            { key: "avg", label: "Average, last 3 months" },
            { key: "projects", label: "Projects" },
            { key: "clients", label: "Clients" },
            { key: "warn", label: "" },
          ]}
          rows={squads.map((s) => ({
            id: s.squad,
            cells: {
              squad: <span className="text-[15px]">{s.squad}</span>,
              booked: <span className="tabular-nums">{n(s.booked)}</span>,
              avg: <span className="tabular-nums text-brand-ink-2">{n(s.average)}</span>,
              projects: <span className="tabular-nums">{s.activeProjects}</span>,
              clients: <span className="tabular-nums">{s.clients}</span>,
              warn: s.warnings.length ? <StatusPill tone="watch">{s.warnings[0]}</StatusPill> : <span className="text-[12px] text-brand-ink-2">OK</span>,
            },
          }))}
        />
        <CardNote>
          Lines count towards the squad of the Price List item they were priced from; monthly services are their own row. A squad is flagged when the month runs over {Math.round(SQUAD_BUSY_FACTOR * 100)}% of its three-month
          average. People&apos;s hours are on Capacity.
        </CardNote>
      </SectionCard>
    </>
  );
}
