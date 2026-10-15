import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOpsPage } from "@/lib/authz";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { FilterChips } from "@/components/ds/filter-chips";
import { SectionCard, CardNote } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { scopeFor } from "@/lib/staff-scope";
import { daysUntil, loadLeadTimes, teamCreditsFor } from "@/lib/plan";
import { nudgeDraft } from "@/lib/plan-nudge";
import { sendNudgeAction } from "@/lib/actions/ops-plan-nudge-actions";
import { jsonArray, cn } from "@/lib/utils";

const DAY = 86400000;
const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
const mondayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));

/**
 * Ops → Plan (Phase S, S7.5): every plan item that needs Klingit's help, and every accepted opportunity, across
 * clients (Mine / All), week by week: brief-by, the client's PM, estimated credits from the Price List lead-time
 * table. Orange within 7 days of brief-by, red once it has passed. "Nudge client" drafts the reminder; the PM sends it.
 */
export default async function OpsPlanPage({ searchParams }: { searchParams: Promise<{ scope?: string; item?: string; sent?: string }> }) {
  const viewer = await requireOpsPage(["ADMIN", "PM"]);
  const q = await searchParams;
  const scope = await scopeFor(viewer, q.scope);
  const now = new Date();
  const inScope = scope.clientIds ? { clientId: { in: scope.clientIds } } : {};
  const [items, leadTimes, contracts] = await Promise.all([
    prisma.clientCalendarItem.findMany({
      where: { ...inScope, archivedAt: null, date: { gte: new Date(now.getTime() - 7 * DAY), lt: new Date(now.getTime() + 84 * DAY) }, OR: [{ maker: "klingit_help" }, { opportunityId: { not: null } }] },
      include: { client: { select: { id: true, name: true, accountLead: { include: { user: { select: { name: true } } } } } } },
      orderBy: { date: "asc" },
    }),
    loadLeadTimes(),
    prisma.contract.findMany({ where: { status: { in: ["active", "paused", "ending"] } }, include: { contact: { include: { user: { select: { name: true } } } } } }),
  ]);
  const pmName = (clientId: string, fallback: string | null) => contracts.find((c) => c.clientId === clientId)?.contact?.user.name ?? fallback ?? "—";
  const weeks = new Map<string, typeof items>();
  for (const i of items) {
    const k = mondayOf(i.briefBy ?? i.date).toISOString();
    weeks.set(k, [...(weeks.get(k) ?? []), i]);
  }
  const nudge = q.item ? items.find((i) => i.id === q.item) : null;
  const href = (s: string) => `/ops/plan?scope=${s}`;

  return (
    <OpsPage>
      <PageHeader eyebrow={`${items.length} items across ${new Set(items.map((i) => i.clientId)).size} clients · next 12 weeks`} title="Plan" />
      <FilterChips label="Whose clients" items={[{ label: "Mine", href: href("mine"), active: scope.mine }, { label: "All", href: href("all"), active: !scope.mine }]} />
      {q.sent && <p className="m-0 rounded-[10px] bg-white px-4 py-3 text-[14px]">Reminder sent.</p>}

      {nudge && (
        <SectionCard title={`Nudge ${nudge.client.name}`}>
          <form action={sendNudgeAction} className="flex flex-col gap-3 px-6 py-5">
            <input type="hidden" name="itemId" value={nudge.id} />
            <textarea
              name="text"
              rows={3}
              defaultValue={nudgeDraft(nudge)}
              className="rounded-[10px] border border-brand-outline px-3 py-2 text-[14px]"
            />
            <span className="flex gap-2">
              <Button type="submit" variant="primary" size="sm">
                Send reminder
              </Button>
              <Link href="/ops/plan" className="self-center text-[13px]">
                Cancel
              </Link>
            </span>
            <span className="text-[12px] text-brand-ink-2">Drafted for you; nothing is sent until you press Send.</span>
          </form>
        </SectionCard>
      )}

      {items.length === 0 ? (
        <SectionCard title="Plan">
          <CardNote>{scope.mine ? "Nothing on your clients' plans needs Klingit in the next 12 weeks." : "Nothing needs Klingit in the next 12 weeks."}</CardNote>
        </SectionCard>
      ) : (
        [...weeks.entries()].map(([week, list]) => (
          <SectionCard key={week} title={`Week of ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(week))}`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-[14px]">
                <tbody>
                  {list.map((i) => {
                    const d = i.briefBy ? daysUntil(i.briefBy, now) : null;
                    const late = d != null && d < 0 && !i.projectId;
                    const soon = d != null && d >= 0 && d <= 7 && !i.projectId;
                    const credits = teamCreditsFor(jsonArray<string>(i.formats), leadTimes);
                    return (
                      <tr key={i.id} className={cn("border-t border-brand-line first:border-t-0", late && "bg-ds-danger-tint", soon && "bg-brand-peach-pale")}>
                        <td className="py-3 pl-6 pr-3">
                          <span className="block">{i.title}</span>
                          <span className="text-[12px] text-brand-ink-2">
                            {i.client.name} · live {day(i.date)}
                            {i.opportunityId ? " · from an opportunity" : ""}
                          </span>
                        </td>
                        <td className={cn("px-3 py-3 text-[13px]", late ? "text-ds-danger-text" : soon ? "text-brand-orange-text" : "text-brand-ink-2")}>{i.projectId ? "Briefed" : i.briefBy ? `Brief by ${day(i.briefBy)}${late ? " · passed" : ""}` : "—"}</td>
                        <td className="px-3 py-3 text-[13px] text-brand-ink-2">PM {pmName(i.clientId, i.client.accountLead?.user.name ?? null)}</td>
                        <td className="px-3 py-3 text-[13px] tabular-nums">{credits != null ? `≈ ${credits} credits` : "—"}</td>
                        <td className="py-3 pl-3 pr-6 text-right">
                          {i.projectId ? (
                            <Link href={`/ops/projects/${i.projectId}`} className="text-[13px]">
                              Project
                            </Link>
                          ) : (
                            <Link href={`/ops/plan?${new URLSearchParams({ ...(q.scope ? { scope: q.scope } : {}), item: i.id })}`} className="text-[13px] underline underline-offset-2">
                              Nudge client
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        ))
      )}
      <p className="m-0 text-[12px] text-brand-ink-2">Estimated credits come from the Price List lead-time table (placeholders).</p>
    </OpsPage>
  );
}
