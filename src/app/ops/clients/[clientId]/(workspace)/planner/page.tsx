import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SectionCard, CardRows, CardNote } from "@/components/ds/card";
import { jsonArray } from "@/lib/utils";
import { daysUntil } from "@/lib/plan";

const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
const MAKER: Record<string, string> = { client: "Client makes it", klingit_help: "Klingit's help needed", klingit_project: "Klingit project" };

/**
 * Client workspace → Plan (Phase S, S7.3): the client's plan for the next 10 weeks with who makes each item and the
 * brief-by dates (orange within 7 days, red when passed), and accepted opportunities.
 */
export default async function ClientPlanPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) notFound();
  const now = new Date();
  const [items, opportunities] = await Promise.all([
    prisma.clientCalendarItem.findMany({ where: { clientId, archivedAt: null, date: { gte: new Date(now.getTime() - 7 * 86400000), lt: new Date(now.getTime() + 70 * 86400000) } }, orderBy: { date: "asc" } }),
    prisma.opportunity.findMany({ where: { clientId, status: "in_plan", hiddenAt: null }, orderBy: { updatedAt: "desc" }, take: 10 }),
  ]);
  return (
    <>
      <SectionCard title="Planner" meta={<span className="text-[12px] text-brand-ink-2">Next 10 weeks</span>}>
        {items.length === 0 ? (
          <CardNote>Nothing planned.</CardNote>
        ) : (
          <CardRows>
            {items.map((i) => {
              const d = i.briefBy ? daysUntil(i.briefBy, now) : null;
              const tone = d == null || i.projectId ? "" : d < 0 ? "text-ds-danger-text" : d <= 7 ? "text-brand-orange-text" : "";
              return (
                <li key={i.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-6 py-3 text-[14px]">
                  <span className="w-32 text-brand-ink-2">{day(i.date)}</span>
                  <span className="min-w-[200px] flex-1">{i.title}</span>
                  <span className="text-[13px] text-brand-ink-2">{[MAKER[i.maker] ?? i.maker, jsonArray<string>(i.formats).join(" + ")].filter(Boolean).join(" · ")}</span>
                  {i.briefBy && !i.projectId && i.maker === "klingit_help" && <span className={`text-[13px] ${tone}`}>Brief by {day(i.briefBy)}</span>}
                  {i.projectId && (
                    <Link href={`/ops/projects/${i.projectId}`} className="text-[13px]">
                      Project
                    </Link>
                  )}
                </li>
              );
            })}
          </CardRows>
        )}
      </SectionCard>
      <SectionCard title="Accepted opportunities">
        {opportunities.length === 0 ? (
          <CardNote>None accepted yet.</CardNote>
        ) : (
          <CardRows>
            {opportunities.map((o) => (
              <li key={o.id} className="flex flex-wrap items-baseline gap-x-4 px-6 py-3 text-[14px]">
                <span className="flex-1">{o.title}</span>
                <span className="text-[13px] text-brand-ink-2">{o.status}</span>
              </li>
            ))}
          </CardRows>
        )}
      </SectionCard>
    </>
  );
}
