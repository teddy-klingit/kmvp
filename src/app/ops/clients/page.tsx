import Link from "next/link";
import { Plus } from "lucide-react";
import { requireOpsPage } from "@/lib/authz";
import { hasAdmin } from "@/lib/role-tier";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { FilterChips } from "@/components/ds/filter-chips";
import { SectionCard, CardNote } from "@/components/ds/card";
import { PillLink } from "@/components/ds/pill-link";
import { scopeFor } from "@/lib/staff-scope";
import { filterClientRows, loadClientRows, type Bal } from "@/lib/client-rows";
import { cn } from "@/lib/utils";

const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "2-digit" }).format(d);
const WAY_LABEL: Record<string, string> = { "1": "1 · Platform", "2": "2 · + PM", "3": "3 · + PM + creative", none: "Not migrated" };

function Bar({ label, b, purple }: { label: string; b: Bal; purple?: boolean }) {
  if (!b) return <span className="text-[12px] text-brand-mute">{label} —</span>;
  const pct = b.of > 0 ? Math.max(0, Math.min(100, (b.left / b.of) * 100)) : 0;
  const low = b.of > 0 && b.left < b.of * 0.2;
  return (
    <span className="flex items-center gap-2 text-[12px]" title={`${label}: ${Math.round(b.left)} of ${Math.round(b.of)} left`}>
      <span className="w-14 text-brand-ink-2">{label}</span>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-brand-track">
        <span className={cn("block h-full rounded-full", low ? "bg-brand-orange" : purple ? "bg-[#B455B6]" : "bg-brand-ink")} style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular-nums">{Math.round(b.left)}</span>
    </span>
  );
}

/**
 * Ops → Clients (Phase S, S7.2): way, platform plan, pack, the three balances, contact person, active projects,
 * notice and renewal, an overdue-invoice flag. Filters: Mine / All (PMs default to their own clients), contact person,
 * way, plan, needs attention. Projects: Clients → All projects; delivered work: Archive.
 */
export default async function ClientsDirectoryPage({ searchParams }: { searchParams: Promise<{ scope?: string; contact?: string; way?: string; plan?: string; attention?: string }> }) {
  const viewer = await requireOpsPage(["ADMIN", "PM"]);
  const q = await searchParams;
  const scope = await scopeFor(viewer, q.scope);
  const money = hasAdmin(viewer);
  const all = await loadClientRows(scope, new Date(), { money });
  const rows = filterClientRows(all, { contact: q.contact, way: q.way, plan: q.plan, attention: q.attention === "1" });
  const href = (patch: Record<string, string | null>) => {
    const s = new URLSearchParams(Object.entries({ scope: q.scope ?? null, contact: q.contact ?? null, way: q.way ?? null, plan: q.plan ?? null, attention: q.attention ?? null, ...patch }).filter((e): e is [string, string] => Boolean(e[1])));
    return `/ops/clients${s.size ? `?${s}` : ""}`;
  };
  const contacts = [...new Map(all.flatMap((r) => (r.contact ? [[r.contact.id, r.contact.name] as const] : []))).entries()];
  const plans = [...new Set(all.map((r) => r.plan))];
  const attention = all.filter((r) => r.attention.length).length;

  return (
    <OpsPage>
      <PageHeader
        eyebrow={`${all.length} client${all.length === 1 ? "" : "s"}${scope.mine ? " · yours" : ""} · ${attention} need attention`}
        title="Clients"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PillLink href="/ops/projects" variant="secondary">
              All projects
            </PillLink>
            <PillLink href="/ops/archive" variant="secondary">
              Archive
            </PillLink>
            <PillLink href="/ops/clients/new" variant="primary">
              <Plus className="size-3.5" strokeWidth={1.75} />
              New client
            </PillLink>
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <FilterChips label="Whose clients" items={[{ label: "Mine", href: href({ scope: "mine" }), active: scope.mine }, { label: "All", href: href({ scope: "all" }), active: !scope.mine }]} />
        <FilterChips label="Needs attention" items={[{ label: "Needs attention", href: href({ attention: q.attention === "1" ? null : "1" }), active: q.attention === "1", count: attention }]} />
      </div>
      <FilterChips label="Way" items={[{ label: "Any way", href: href({ way: null }), active: !q.way }, ...["1", "2", "3", "none"].map((w) => ({ label: WAY_LABEL[w], href: href({ way: w }), active: q.way === w, count: all.filter((r) => String(r.way ?? "none") === w).length }))]} />
      <div className="flex flex-wrap gap-3">
        <FilterChips label="Plan" items={[{ label: "Any plan", href: href({ plan: null }), active: !q.plan }, ...plans.map((p) => ({ label: p, href: href({ plan: p }), active: q.plan === p }))]} />
        {contacts.length > 1 && <FilterChips label="Contact person" items={[{ label: "Anyone", href: href({ contact: null }), active: !q.contact }, ...contacts.map(([id, name]) => ({ label: name, href: href({ contact: id }), active: q.contact === id }))]} />}
      </div>

      <SectionCard title={q.attention === "1" ? "Need attention" : "Clients"}>
        {rows.length === 0 ? (
          <CardNote>{scope.mine ? "None of your clients match. Try All." : "No clients match these filters."}</CardNote>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-[14px]">
              <thead>
                <tr className="text-left text-[12px] text-brand-ink-2">
                  {["Client", "Way", "Plan · pack", "Balances", "Contact person", "Active", "Notice · renews", ...(money ? ["Invoices"] : [])].map((h) => (
                    <th key={h} className="px-3 py-2.5 font-medium first:pl-6 last:pr-6">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={cn("border-t border-brand-line align-top", r.attention.length > 0 && "bg-[#FFF9F5]")}>
                    <td className="py-3 pl-6 pr-3">
                      <Link href={`/ops/clients/${r.id}/dashboard`} className="text-[15px] text-brand-ink">
                        {r.name}
                      </Link>
                      {r.attention.length > 0 && <span className="block text-[12px] text-brand-orange-text">{r.attention.join(" · ")}</span>}
                    </td>
                    <td className="px-3 py-3 text-[13px]">{r.way ? WAY_LABEL[String(r.way)] : <span className="text-brand-ink-2">Not migrated</span>}</td>
                    <td className="px-3 py-3 text-[13px]">
                      {r.plan}
                      {r.pack && <span className="block text-brand-ink-2">{r.pack}</span>}
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-col gap-1">
                        <Bar label="AI" b={r.ai} purple />
                        <Bar label="PM" b={r.pm} />
                        <Bar label="Creative" b={r.creative} />
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[13px]">{r.contact?.name ?? <span className="text-brand-orange-text">Not set</span>}</td>
                    <td className="px-3 py-3 tabular-nums">{r.activeProjects}</td>
                    <td className="px-3 py-3 text-[13px]">
                      {r.noticeDeadline ? `Notice ${day(r.noticeDeadline)}` : "—"}
                      {r.endDate && <span className="block text-brand-ink-2">Renews {day(r.endDate)}</span>}
                    </td>
                    {money && <td className="py-3 pl-3 pr-6 text-[12px]">{r.overdueInvoices > 0 ? <span className="text-brand-orange-text">Invoice overdue</span> : <span className="text-brand-ink-2">Invoices OK</span>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </OpsPage>
  );
}
