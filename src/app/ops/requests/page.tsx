import { prisma } from "@/lib/prisma";
import { requireOpsPage } from "@/lib/authz";
import { scopeFor } from "@/lib/staff-scope";
import { TodayHome } from "@/components/ops/today/today-home";
import { SectionCard, CardRows } from "@/components/ds/card";
import { REQUEST_KINDS, type RequestKind } from "@/lib/requests";

const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);

/**
 * Ops → Requests (Phase T): requests live in Today now. This URL stays as Today filtered to requests (approve or
 * decline in place, the same actions), with the recent decisions under it. Linked from Admin.
 */
export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const viewer = await requireOpsPage(["ADMIN", "PM"]);
  const q = await searchParams;
  const recent = await prisma.purchaseRequest.findMany({ where: { status: { not: "pending" } }, include: { client: { select: { name: true } } }, orderBy: { decidedAt: "desc" }, take: 15 });
  const users = new Map((await prisma.user.findMany({ where: { id: { in: recent.flatMap((r) => (r.decidedByUserId ? [r.decidedByUserId] : [])) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <TodayHome viewer={viewer} scope={await scopeFor(viewer, q.scope ?? "all")} kind="REQUEST">
      {recent.length > 0 && (
        <SectionCard title="Decided">
          <CardRows>
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 px-6 py-3 text-[14px]">
                <span className="w-24 text-[12px] text-brand-ink-2">{r.decidedAt ? day(r.decidedAt) : ""}</span>
                <span>{REQUEST_KINDS[r.kind as RequestKind]?.label ?? r.kind}</span>
                <span className="text-brand-ink-2">{r.client.name}</span>
                <span className="text-[13px]">
                  {r.status} by {r.decidedByUserId ? (users.get(r.decidedByUserId) ?? "staff") : "auto"}
                  {r.decisionNote ? ` · ${r.decisionNote}` : ""}
                </span>
              </li>
            ))}
          </CardRows>
        </SectionCard>
      )}
    </TodayHome>
  );
}
