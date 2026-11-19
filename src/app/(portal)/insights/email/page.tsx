import Link from "next/link";
import { getPortalViewer } from "@/lib/current-viewer";
import { parseRange } from "@/lib/insights/daily";
import { loadEmailTab } from "@/lib/insights/email-tab";
import { askedAbout, tabFindings } from "@/lib/insight-records";
import { prisma } from "@/lib/prisma";
import { hrefAliases } from "@/lib/insights/tabs";
import { answerCard, type Signal, type SignalStatus } from "@/lib/insights/short-answer";
import { count, money, pct1, pts, signedPct, vsLabel } from "@/lib/insights/format";
import { connectHref } from "@/lib/insights-data";
import { marketingPm } from "@/lib/contact-person";
import { BlindSpots, Blurred, Card, KeyNumbers, ShortAnswer, StatTiles, StatusPill, WhatItMeans, WhatWeFound, type BlindSpot } from "@/components/insights/tab-parts";
import { AskIdeaButton } from "@/components/insights/ask-idea-button";
import { MessagePmButton } from "@/components/pm-panel/pm-panel-provider";
import { WORK_TZ } from "@/lib/working-hours";

const PURPLE = "#B455B6";
const day = (d: Date | string) => new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, day: "numeric", month: "short" }).format(typeof d === "string" ? new Date(`${d}T12:00:00Z`) : d);

/**
 * Insights → Email (Phase X v2, Ins4Email): "Do our newsletters and automatic emails sell?" The short answer, sales
 * from email (the same number as Email on Sales), subscribers, open and click rate; automatic flows vs newsletters;
 * best and worst emails; list health with Re-engage / Clean up; findings and blind spots. Without Klaviyo: a
 * blurred example and Connect, never zeros.
 */
export default async function EmailPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const days = parseRange((await searchParams).range);
  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;
  const [t, findings, pm, connect] = await Promise.all([loadEmailTab(clientId, { days }), tabFindings(clientId, hrefAliases("/insights/email")), marketingPm(clientId), connectHref(clientId)]);
  const pmFirst = pm?.name.split(" ")[0] ?? "Klingit";
  const cur = t.currency;
  const n = t.numbers;
  const vs = vsLabel(days);
  const reconnect = t.klaviyo && ["needs_reconnect", "error"].includes(t.klaviyo.status);
  const connected = t.klaviyo?.status === "connected" || reconnect;

  const blind: BlindSpot[] = [
    ...(reconnect && t.klaviyo ? [{ text: `Klaviyo disconnected since ${day(t.klaviyo.updatedAt)}: email numbers stopped coming in.`, action: { label: "Reconnect", href: "/settings/connections" } }] : []),
    ...(connected ? [] : [{ text: "Klaviyo isn’t connected, so we can’t see what email sells.", action: { label: "Connect", href: connect } }]),
    ...(connected && !t.hasKlaviyoNumbers ? [{ text: "Klaviyo is connected, but its sends, opens and flows haven’t arrived yet.", action: null }] : []),
  ];

  if (!connected || !t.hasKlaviyoNumbers) {
    return (
      <div className="flex flex-col gap-6">
        <Blurred line="Connect Klaviyo to see what your newsletters and automatic flows sell, and how healthy your list is." action={{ label: reconnect ? "Reconnect Klaviyo" : "Connect Klaviyo", href: connect }}>
          <KeyNumbers items={["Sales from email", "Subscribers", "Open rate", "Click rate"].map((label) => ({ label, value: "00k", spark: [3, 4, 4, 5, 6] }))} />
        </Blurred>
        <BlindSpots items={blind} />
      </div>
    );
  }

  const topFlow = t.flows[0];
  const asleep = t.list.inactiveShare !== null && t.list.inactiveShare >= 0.2;
  const signals: Signal[] = [
    ...(t.flowSales ? [{ id: "flows", status: "good" as const, value: money(t.flowSales, cur), label: `From automatic flows, of ${money(n.sales.value, cur)} total`, weight: 3 }] : []),
    ...(topFlow ? [{ id: "top", status: "good" as const, value: money(topFlow.sales, cur), label: `From the ${topFlow.name.toLowerCase()}, your best flow`, weight: 1.5 }] : []),
    ...(n.sales.change !== null ? [{ id: "change", status: (n.sales.change >= 0 ? "good" : "attention") as SignalStatus, value: signedPct(n.sales.change), label: "Sales from email", weight: 1.8 }] : []),
    ...(t.list.inactive !== null && asleep ? [{ id: "asleep", status: "attention" as const, value: count(t.list.inactive), label: "Subscribers haven’t opened in 90 days", weight: 2.8 }] : []),
  ];
  const card = answerCard(`${clientId}:email:${days}`, {
    headline: [
      t.flowSales > t.newsletterSales ? "Automatic flows earn most." : t.newsletterSales ? "Newsletters earn most." : `Email brought ${money(n.sales.value, cur)}.`,
      asleep ? `${t.list.inactiveShare! >= 0.24 && t.list.inactiveShare! <= 0.26 ? "A quarter" : `${Math.round(t.list.inactiveShare! * 100)}%`} of your list is asleep.` : null,
    ]
      .filter(Boolean)
      .join(" "),
    signals,
  });
  const openDiff = n.open.value !== null && n.open.previous !== null ? n.open.value - n.open.previous : null;
  const clickDiff = n.click.value !== null && n.click.previous !== null ? n.click.value - n.click.previous : null;
  const nextMoment = await prisma.keyMoment.findFirst({ where: { date: { gte: new Date() }, kind: "shopping", clientId: null }, orderBy: { date: "asc" }, select: { name: true } });
  const sleepText = t.list.inactive !== null ? `Win back the ${count(t.list.inactive)} sleepers${nextMoment ? ` before ${nextMoment.name}` : ""}.` : "";
  const sleepAsked = sleepText ? await askedAbout(clientId, "community", [sleepText]) : new Set<string>();
  const maxFlow = Math.max(1, ...t.flows.map((f) => f.sales));

  return (
    <div className="flex flex-col gap-6">
      <ShortAnswer card={card} sources={["Klaviyo", "Shopify"]} />

      <KeyNumbers
        items={[
          { label: "Sales from email", value: money(n.sales.value, cur), change: n.sales.change !== null ? { text: `${signedPct(n.sales.change)} ${vs}`, tone: n.sales.change >= 0 ? "good" : "bad" } : null, spark: n.sales.spark },
          { label: "Subscribers", value: n.subscribers.value !== null ? count(n.subscribers.value) : "Not reported", change: n.subscribers.growth !== null ? { text: `${n.subscribers.growth >= 0 ? "+" : "−"}${count(Math.abs(n.subscribers.growth))}`, tone: n.subscribers.growth >= 0 ? "good" : "bad" } : null },
          { label: "Open rate", value: n.open.value !== null ? `${Math.round(n.open.value)}%` : "No sends yet", change: openDiff !== null ? { text: Math.abs(openDiff) < 1 ? "stable" : `${pts(openDiff)} ${vs}`, tone: openDiff >= -0.5 ? "good" : "bad" } : null, spark: n.open.spark },
          { label: "Click rate", value: n.click.value !== null ? pct1(n.click.value) : "No sends yet", change: clickDiff !== null ? { text: `${pts(clickDiff)} ${vs}`, tone: clickDiff >= 0 ? "good" : "bad" } : null, spark: n.click.spark },
        ]}
      />

      {(t.flows.length > 0 || t.newsletters.length > 0) && (
        <Card title="Automatic flows vs newsletters">
          <div className="grid grid-cols-1 gap-4 min-[700px]:grid-cols-2">
            <div className="flex flex-col gap-1 rounded-[12px] bg-[#F2F6E4] px-4 py-4">
              <span className="text-[13px] text-brand-ink-2">Automatic flows</span>
              <span className="text-[26px] font-fw-medium tabular-nums">{money(t.flowSales, cur)}</span>
              <span className="text-[12px] text-brand-ink-2">{t.flows.length} flow{t.flows.length === 1 ? "" : "s"} · run by themselves</span>
            </div>
            <div className="flex flex-col gap-1 rounded-[12px] bg-[#F8F5EE] px-4 py-4">
              <span className="text-[13px] text-brand-ink-2">Newsletters</span>
              <span className="text-[26px] font-fw-medium tabular-nums">{money(t.newsletterSales, cur)}</span>
              <span className="text-[12px] text-brand-ink-2">
                {t.newsletters.length} send{t.newsletters.length === 1 ? "" : "s"}
                {t.newsletters.length ? ` · ${money(t.newsletterSales / t.newsletters.length, cur)} per send` : ""}
              </span>
            </div>
          </div>
          {t.flows.length > 0 && (
            <ul className="m-0 mt-5 flex list-none flex-col gap-2 p-0">
              <li className="font-brand-mono text-[11px] uppercase tracking-[0.04em] text-brand-ink-2">Sales per flow</li>
              {t.flows.map((f) => (
                <li key={f.id} className="grid grid-cols-[130px_minmax(0,1fr)_64px] items-center gap-3 text-[14px]">
                  <span>{f.name}</span>
                  <span aria-hidden className="h-2.5 rounded-full" style={{ width: `${Math.max(2, (f.sales / maxFlow) * 100)}%`, background: PURPLE }} />
                  <span className="text-right font-fw-medium tabular-nums">{money(f.sales, cur)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="m-0 mt-4 text-[12px] text-brand-ink-2">Flows and sends as Klaviyo reports them; the total above is the shop’s, shared credit, the same as on Sales.</p>
        </Card>
      )}

      <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          {t.best.length > 0 && (
            <Card title="Your best and worst emails" flush>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[440px] border-collapse text-[14px]">
                  <thead>
                    <tr className="bg-[#FAF8F3] text-left font-brand-mono text-[11px] uppercase tracking-[0.04em] text-brand-ink-2">
                      <th className="px-6 py-3 font-normal">Email</th>
                      <th className="px-3 py-3 font-normal">Open</th>
                      <th className="px-3 py-3 font-normal">Sales</th>
                      <th className="px-6 py-3 font-normal" aria-label="Status" />
                    </tr>
                  </thead>
                  <tbody>
                    {t.best.map((e) => (
                      <tr key={e.id} className="border-t border-brand-line">
                        <td className="px-6 py-3.5">
                          <span className="flex min-w-0 flex-col">
                            <span className="text-[15px] font-fw-medium">“{e.subject}”</span>
                            <span className="text-[12px] text-brand-ink-2">Newsletter · {day(e.date)}</span>
                          </span>
                        </td>
                        <td className="px-3 py-3.5 font-fw-medium tabular-nums">{e.openRate !== null ? `${Math.round(e.openRate)}%` : "–"}</td>
                        <td className="px-3 py-3.5 font-fw-medium tabular-nums">{money(e.sales, cur)}</td>
                        <td className="px-6 py-3.5">
                          <StatusPill tone={e.tag === "Best" ? "good" : "bad"}>{e.tag}</StatusPill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {t.discountRead ? <WhatItMeans className="mt-2">Calm subject lines beat discount ones with your list ({Math.round(t.discountRead.calm)}% vs {Math.round(t.discountRead.discount)}% opens).</WhatItMeans> : <div className="h-6" />}
            </Card>
          )}
          <WhatWeFound findings={findings} pm={pmFirst} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          {t.list.subscribers !== null && (
            <Card title="List health" flush>
              <div className="px-6 pt-5">
                <StatTiles
                  items={[
                    { value: count(t.list.subscribers), label: `subscribers${t.list.growth !== null ? `, ${t.list.growth >= 0 ? "+" : "−"}${count(Math.abs(t.list.growth))}` : ""}`, tone: "neutral" },
                    ...(t.list.unsubscribeRate !== null ? [{ value: pct1(t.list.unsubscribeRate), label: "unsubscribe per send", tone: "neutral" as const }] : []),
                    ...(t.list.inactive !== null ? [{ value: count(t.list.inactive), label: `inactive 90 days${t.list.inactiveShare !== null ? ` (${Math.round(t.list.inactiveShare * 100)}%)` : ""}`, tone: (t.list.inactiveShare ?? 0) >= 0.2 ? ("bad" as const) : ("neutral" as const) }] : []),
                  ]}
                />
              </div>
              {t.list.inactive !== null && (t.list.inactiveShare ?? 0) >= 0.1 ? (
                <>
                  <WhatItMeans className="mb-4 mt-4" action={<AskIdeaButton variant="dark" asked={sleepAsked.has(sleepText)} pm={pmFirst} about={{ question: sleepText, value: count(t.list.inactive), sources: ["Klaviyo"], href: "/insights/email", kind: "community" }} />}>
                    {sleepText}
                  </WhatItMeans>
                  <div className="flex flex-wrap gap-2 px-6 pb-6">
                    <Link href={`/brief/new?${new URLSearchParams({ q: `A win-back email for the ${count(t.list.inactive)} subscribers who haven't opened in 90 days.` })}`} className="inline-flex h-9 items-center rounded-full border border-brand-ink px-4 font-brand-mono text-[12px] text-brand-ink no-underline hover:bg-brand-ink hover:text-white">
                      Re-engage
                    </Link>
                    <MessagePmButton dot={false} className="inline-flex h-9 items-center rounded-full border border-brand-outline px-4 font-brand-mono text-[12px] text-brand-ink hover:border-brand-ink">
                      Clean up with {pmFirst}
                    </MessagePmButton>
                  </div>
                </>
              ) : (
                <div className="h-6" />
              )}
            </Card>
          )}
          <BlindSpots items={blind} />
        </div>
      </div>
    </div>
  );
}
