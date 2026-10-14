import { prisma } from "@/lib/prisma";
import { requireOpsPage } from "@/lib/authz";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { SectionCard, CardRows, CardNote } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { REQUEST_KINDS, type RequestKind } from "@/lib/requests";
import { money } from "@/lib/invoicing";
import { decideRequestAction } from "@/lib/actions/ops-billing-actions";

const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);

/** What approving does, in one line, and how it reaches the invoice. */
function effect(kind: string, payload: Record<string, unknown>, price: number | null, currency: string) {
  const p = price != null ? money(price, currency) : "price to set";
  switch (kind as RequestKind) {
    case "creative_pack":
      return `+${payload.credits ?? 10} creative credits now · ${p} on the next invoice`;
    case "ai_topup":
      return `+${Number(payload.credits ?? 0).toLocaleString("en-GB")} AI credits now · ${p} on the next invoice`;
    case "extra_slot":
      return `+1 active project · ${p} a month from the next invoice`;
    case "plan_change":
      return `${payload.teamPackKey ? `Pack ${payload.teamPackKey}` : "Platform only"}${payload.months ? ` for ${payload.months} months` : ""} · ${p} a month once it applies`;
    case "pause":
      return "Pauses the contract now (platform stays, new projects stop)";
    default:
      return "Nothing changes automatically: set it up on the contract";
  }
}

/**
 * Ops → Requests (Phase S): extra creative packs, AI top-ups, extra slots, plan and pack changes, pauses and Per
 * request asks, oldest first. Approve or decline with a note; the price and its effect on the next invoice show here.
 */
export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireOpsPage(["ADMIN", "PM"]);
  const q = await searchParams;
  const [pending, recent] = await Promise.all([
    prisma.purchaseRequest.findMany({ where: { status: "pending" }, include: { client: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.purchaseRequest.findMany({ where: { status: { not: "pending" } }, include: { client: { select: { name: true } } }, orderBy: { decidedAt: "desc" }, take: 15 }),
  ]);
  const users = new Map((await prisma.user.findMany({ where: { id: { in: [...pending, ...recent].flatMap((r) => [r.requestedByUserId, r.decidedByUserId]).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  return (
    <OpsPage>
      <PageHeader eyebrow={`${pending.length} waiting`} title="Requests" />
      {q.error && <p className="m-0 rounded-[10px] bg-ds-watch-tint px-4 py-3 text-[14px] text-ds-watch-text">{q.error}</p>}
      <SectionCard title="Waiting for a decision">
        {pending.length === 0 ? (
          <CardNote>Nothing waiting.</CardNote>
        ) : (
          <CardRows>
            {pending.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 px-6 py-4">
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-[16px]">{REQUEST_KINDS[r.kind as RequestKind]?.label ?? r.kind}</span>
                  <span className="text-[14px]">{r.client.name}</span>
                  <span className="text-[12px] text-brand-ink-2">
                    {users.get(r.requestedByUserId ?? "") ?? "Someone"} · {day(r.createdAt)}
                  </span>
                </span>
                <span className="text-[14px]">{effect(r.kind, r.payload as Record<string, unknown>, r.price, r.currency)}</span>
                {(r.payload as { note?: string }).note && <span className="text-[13px] text-brand-ink-2">“{(r.payload as { note?: string }).note}”</span>}
                <form action={decideRequestAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="requestId" value={r.id} />
                  <input name="note" placeholder="Note for the client (optional)" className="h-9 min-w-[240px] flex-1 rounded-[8px] border border-brand-outline px-3 text-[14px]" />
                  <Button type="submit" name="decision" value="approve" variant="primary" size="sm">
                    Approve
                  </Button>
                  <Button type="submit" name="decision" value="decline" variant="secondary" size="sm">
                    Decline
                  </Button>
                </form>
              </li>
            ))}
          </CardRows>
        )}
      </SectionCard>
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
    </OpsPage>
  );
}
