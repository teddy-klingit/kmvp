import Link from "next/link";
import { Play } from "lucide-react";
import { getPortalViewer } from "@/lib/current-viewer";
import { prisma } from "@/lib/prisma";
import { parseRange } from "@/lib/insights/daily";
import { DAYS, SLOTS, formatGroup, loadOrganicTab } from "@/lib/insights/organic-tab";
import { askedAbout, tabFindings } from "@/lib/insight-records";
import { hrefAliases } from "@/lib/insights/tabs";
import { answerCard, type Signal, type SignalStatus } from "@/lib/insights/short-answer";
import { count, pct1, pts, signedPct, times, vsLabel } from "@/lib/insights/format";
import { connectHref } from "@/lib/insights-data";
import { marketingPm } from "@/lib/contact-person";
import { resolveCommunityEscalationAction } from "@/lib/actions/community-actions";
import { pillClass } from "@/components/ds/button";
import { AskIdeaButton } from "@/components/insights/ask-idea-button";
import { BlindSpots, Blurred, Card, KeyNumbers, MeansButton, ShortAnswer, StatTiles, WhatItMeans, WhatWeFound, type BlindSpot } from "@/components/insights/tab-parts";
import { cn } from "@/lib/utils";
import { WORK_TZ } from "@/lib/working-hours";

const PURPLE = "#B455B6";
const BLUE = "#5B6FB0";
const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, day: "numeric", month: "short" }).format(d);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Insights → Organic social (Phase X v2, Ins4Organic): "Are our own channels growing, and what content works?" The
 * short answer, reach / followers / engagement / saves & shares, what content works (by format and by theme), top
 * posts, when the audience is online, what the community says (and what needs a response), findings and blind spots.
 * Who the audience is lives in Brand OS → Audience.
 */
export default async function OrganicSocialPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const days = parseRange((await searchParams).range);
  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;
  const [t, findings, pm, broken, connect] = await Promise.all([
    loadOrganicTab(clientId, { days }),
    tabFindings(clientId, hrefAliases("/insights/organic")),
    marketingPm(clientId),
    prisma.dataSource.findMany({ where: { clientId, source: { in: ["Meta", "TikTok", "LinkedIn"] }, status: { in: ["needs_reconnect", "error"] } } }),
    connectHref(clientId),
  ]);
  const pmFirst = pm?.name.split(" ")[0] ?? "Klingit";
  const n = t.numbers;
  const vs = vsLabel(days);
  const asked = t.community ? await askedAbout(clientId, "community", t.community.questions.map((q) => q.question)) : new Set<string>();

  const blind: BlindSpot[] = [
    ...broken.map((s) => ({ text: `${s.source} disconnected since ${day(s.updatedAt)}: numbers above miss ${s.source}.`, action: { label: "Reconnect", href: "/settings/connections" } })),
    ...(t.posts ? [] : [{ text: "Your posts: connect Instagram, TikTok or LinkedIn pages to see reach and what content works.", action: { label: "Connect", href: connect } }]),
    ...(t.activity ? [] : [{ text: "When your audience is online: Instagram insights add the day and time view.", action: { label: "Connect", href: connect } }]),
    ...(t.community ? [] : [{ text: "Comments and DMs: once community management runs, what people say and ask shows here.", action: null }]),
  ];

  if (!t.posts && !n.followers.value) {
    return (
      <div className="flex flex-col gap-6">
        <Blurred line="Connect your Instagram, TikTok or LinkedIn pages to see reach, followers and what content works." action={{ label: "Connect", href: connect }}>
          <KeyNumbers items={["Reach", "Followers", "Engagement", "Saves & shares"].map((label) => ({ label, value: "00k", spark: [2, 3, 3, 4, 5] }))} />
        </Blurred>
        <BlindSpots items={blind} />
      </div>
    );
  }

  // ─── The short answer: computed from the numbers below ───────────────────────
  const reels = t.formats.find((f) => f.format === "Reels");
  const topTheme = t.themes[0];
  const best = t.activity?.best;
  const reelsDown = reels && reels.postedBefore !== null && reels.posted < reels.postedBefore;
  const signals: Signal[] = [
    ...(reels && reels.postedBefore !== null && reels.posted !== reels.postedBefore ? [{ id: "reels", status: (reelsDown ? "attention" : "good") as SignalStatus, value: `${reels.posted} vs ${reels.postedBefore}`, label: `Reels posted, ${days === 30 ? "this month vs last" : "this period vs the one before"}`, weight: reelsDown ? 3 : 1 }] : []),
    ...(n.reach.change !== null && t.posts ? [{ id: "reach", status: (n.reach.change >= 0 ? "good" : "attention") as SignalStatus, value: signedPct(n.reach.change), label: `Reach, now ${count(n.reach.value)}`, weight: reelsDown ? 1 : 2.5 }] : []),
    ...(n.followers.growth ? [{ id: "followers", status: (n.followers.growth > 0 ? "good" : "attention") as SignalStatus, value: `${n.followers.growth > 0 ? "+" : "−"}${count(Math.abs(n.followers.growth), { exactUnder: 1_000 })}`, label: `New followers, now ${count(n.followers.value)}`, weight: 2 }] : []),
    ...(best ? [{ id: "slot", status: "watch" as const, value: `${DAYS[best.day].slice(0, 3)} ${SLOTS[best.slot].toLowerCase()}`, label: "When your audience is most active", weight: 1.5 }] : []),
    ...(topTheme ? [{ id: "theme", status: "good" as const, value: `“${topTheme.theme.toLowerCase()}”`, label: "The content your audience saves most", weight: 1.2 }] : []),
  ];
  const card = answerCard(`${clientId}:organic:${days}`, {
    headline: !t.posts
      ? "No reach numbers for posts in this period yet."
      : n.reach.change !== null
        ? reelsDown && n.reach.change < 0
          ? `Fewer Reels cut your reach by ${Math.abs(Math.round(n.reach.change * 100))}%.`
          : `Reach ${n.reach.change < 0 ? "fell" : "grew"} ${Math.abs(Math.round(n.reach.change * 100))}%.`
        : `Your posts reached ${count(n.reach.value)} people.`,
    signals,
  });

  const erDiff = n.engagement.value !== null && n.engagement.previous !== null ? n.engagement.value - n.engagement.previous : null;
  const maxReach = Math.max(1, ...t.formats.map((f) => f.avgReach));
  const maxSaves = Math.max(1, ...t.themes.map((x) => x.savesPerPost));
  const single = t.formats.find((f) => f.format === "Single images");
  const read = [
    reels && single && single.avgReach ? `Reels reach ${times(reels.avgReach / single.avgReach).replace(".0×", "×")} more than single images` : null,
    topTheme ? `“${topTheme.theme.toLowerCase()}” content gets saved most` : null,
  ].filter(Boolean);
  const contentAsk = read.length ? `${read.join(", and ").replace(/^./, (c) => c.toUpperCase())}` : "";
  const contentAsked = contentAsk ? await askedAbout(clientId, "community", [contentAsk]) : new Set<string>();
  const maxCell = t.activity ? Math.max(1, ...t.activity.grid.flat()) : 1;
  const topQuestion = t.community?.questions[0];
  const maxQuestion = Math.max(1, ...(t.community?.questions.map((q) => q.count) ?? [1]));

  return (
    <div className="flex flex-col gap-6">
      <ShortAnswer card={card} sources={t.platforms} />

      <KeyNumbers
        items={[
          { label: "Reach", value: t.posts ? count(n.reach.value) : "No numbers yet", change: n.reach.change !== null ? { text: `${signedPct(n.reach.change)} ${vs}`, tone: n.reach.change >= 0 ? "good" : "bad" } : null, spark: n.reach.spark },
          { label: "Followers", value: count(n.followers.value), change: n.followers.growth !== null ? { text: `${n.followers.growth >= 0 ? "+" : "−"}${count(Math.abs(n.followers.growth), { exactUnder: 1000 })} in the last ${days === 365 ? "12 months" : `${days} days`}`, tone: n.followers.growth >= 0 ? "good" : "bad" } : null, spark: n.followers.spark },
          { label: "Engagement", value: n.engagement.value !== null ? pct1(n.engagement.value) : "No numbers yet", change: erDiff !== null ? { text: `${pts(erDiff)} ${vs}`, tone: erDiff >= 0 ? "good" : "bad" } : null, spark: n.engagement.spark },
          { label: "Saves & shares", value: t.posts ? count(n.savesShares.value) : "No numbers yet", change: n.savesShares.change !== null ? { text: `${signedPct(n.savesShares.change)} ${vs}`, tone: n.savesShares.change >= 0 ? "good" : "bad" } : null, spark: n.savesShares.spark },
        ]}
      />

      {t.posts > 0 && (t.formats.length > 0 || t.themes.length > 0) && (
        <Card title="What content works for you" flush>
          <div className="grid grid-cols-1 gap-8 px-6 pt-5 min-[900px]:grid-cols-2">
            {t.formats.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-[13px] text-brand-ink-2">By format · average reach per post</span>
                {t.formats.filter((f) => f.posted > 0).map((f) => (
                  <span key={f.format} className="grid grid-cols-[96px_minmax(0,1fr)_44px_88px] items-center gap-3 text-[14px]">
                    <span>{f.format}</span>
                    <span aria-hidden className="h-2.5 rounded-full" style={{ width: `${Math.max(2, (f.avgReach / maxReach) * 100)}%`, background: PURPLE }} />
                    <span className="text-right tabular-nums">{count(f.avgReach)}</span>
                    <span className="text-right text-[12px] text-brand-ink-2">{f.postedBefore !== null && f.postedBefore !== f.posted ? `${f.postedBefore} → ${f.posted} posted` : `${f.posted} posted`}</span>
                  </span>
                ))}
              </div>
            )}
            {t.themes.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-[13px] text-brand-ink-2">By theme · saves per post</span>
                {t.themes.map((x) => (
                  <span key={x.theme} className="grid grid-cols-[120px_minmax(0,1fr)_44px] items-center gap-3 text-[14px]">
                    <span>{x.theme}</span>
                    <span aria-hidden className="h-2.5 rounded-full" style={{ width: `${Math.max(2, (x.savesPerPost / maxSaves) * 100)}%`, background: BLUE }} />
                    <span className="text-right tabular-nums">{Math.round(x.savesPerPost)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          {read.length > 0 ? (
            <WhatItMeans
              className="mt-5"
              action={<AskIdeaButton variant="dark" asked={contentAsked.has(contentAsk)} pm={pmFirst} about={{ question: contentAsk, value: reels && single && single.avgReach ? times(reels.avgReach / single.avgReach) : "", sources: t.platforms.slice(0, 2), href: "/insights/organic", kind: "community" }} />}
            >
              {read.join(", and ").replace(/^./, (c) => c.toUpperCase())}.{topTheme && reels ? ` Post more ${topTheme.theme.split(/[ &]/)[0].toLowerCase().replace(/s$/, "")} Reels.` : ""}
            </WhatItMeans>
          ) : (
            <div className="h-6" />
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          {t.top.length > 0 && (
            <Card title={`Top posts, last ${days === 365 ? "12 months" : `${days} days`}`} flush>
              <ul className="m-0 list-none p-0">
                {t.top.map((p) => (
                  <li key={p.id} className="flex items-center gap-4 border-b border-brand-line px-6 py-3.5 last:border-b-0">
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-[10px] bg-[#F3E2D8]">{formatGroup(p.contentType) === "Reels" && <Play className="size-4 rounded-full bg-white p-0.5" strokeWidth={2} />}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px]">
                        {p.title}
                      </span>
                      <span className="text-[12px] text-brand-ink-2">{[p.platform, p.contentType ? (formatGroup(p.contentType)?.replace(/s$/, "") ?? p.contentType) : null, day(p.publishedDate!)].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="flex shrink-0 flex-col text-right tabular-nums">
                      <span className="text-[18px]">{p.reach ? count(p.reach) : p.videoViews ? count(p.videoViews) : "–"}</span>
                      <span className="text-[12px] text-brand-ink-2">{[p.reach ? "reach" : p.videoViews ? "views" : null, p.saves ? `${count(p.saves, { exactUnder: 10_000 })} saves` : null].filter(Boolean).join(" · ")}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <WhatWeFound findings={findings} pm={pmFirst} />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {t.activity && (
            <Card title="When your audience is active" flush>
              <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] gap-1.5 px-6 pt-5 text-[11px] text-brand-ink-2">
                <span />
                {DAYS.map((d) => (
                  <span key={d} className="text-center">
                    {d.slice(0, 3)}
                  </span>
                ))}
                {SLOTS.map((s2, slot) => (
                  <span key={s2} className="contents">
                    <span className="self-center">{s2}</span>
                    {t.activity!.grid.map((row, d) => (
                      <span key={d} title={`${DAYS[d]} ${s2.toLowerCase()}`} className={cn("h-6 rounded-[4px]", t.activity!.best.day === d && t.activity!.best.slot === slot && "ring-2 ring-brand-ink ring-offset-1")} style={{ background: PURPLE, opacity: 0.15 + 0.85 * (row[slot] / maxCell) }} />
                    ))}
                  </span>
                ))}
              </div>
              <WhatItMeans className="mt-4">
                {DAYS[t.activity.best.day]} {SLOTS[t.activity.best.slot].toLowerCase()} is your best slot.
                {t.activity.quietPosts ? ` ${t.activity.quietPosts} of ${plural(t.activity.total, "post")} went out at your quietest times.` : ""}
              </WhatItMeans>
            </Card>
          )}

          {t.community && (
            <Card title="What your community says" id="community" flush>
              <div className="flex flex-col gap-4 px-6 pt-5">
                <StatTiles
                  items={[
                    { value: `${t.community.positive}%`, label: "Positive", tone: "good" },
                    { value: `${t.community.neutral}%`, label: "Neutral", tone: "neutral" },
                    { value: `${t.community.negative}%`, label: "Negative", tone: "bad" },
                  ]}
                />
                {t.community.questions.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="font-brand-mono text-[11px] uppercase tracking-[0.04em] text-brand-ink-2">Most asked · {count(t.community.comments, { exactUnder: 10_000 })} comments</span>
                    <ul className="m-0 flex list-none flex-col gap-2 p-0">
                      {t.community.questions.map((q) => (
                        <li key={q.question} className="grid grid-cols-[minmax(0,1fr)_120px_32px] items-center gap-3 text-[14px]">
                          <span className="min-w-0">“{q.question}”</span>
                          <span aria-hidden className="h-2 rounded-full bg-[#ECE8DF]">
                            <span className="block h-full rounded-full" style={{ width: `${(q.count / maxQuestion) * 100}%`, background: PURPLE }} />
                          </span>
                          <span className="text-right tabular-nums">{q.count}</span>
                          <span className="col-span-3 -mt-1">
                            <AskIdeaButton asked={asked.has(q.question)} pm={pmFirst} about={{ question: `“${q.question}” asked ${q.count} times`, value: String(q.count), sources: t.platforms.slice(0, 2), href: "/insights/organic", kind: "community" }} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {topQuestion ? (
                <WhatItMeans className="mt-4" action={<MeansButton href={`/brief/new?${new URLSearchParams({ q: `A post that answers “${topQuestion.question}” (asked ${topQuestion.count} times in comments and DMs).` })}`}>Turn into a post</MeansButton>}>
                  These questions are ready-made posts.
                </WhatItMeans>
              ) : (
                <div className="h-6" />
              )}
              {t.escalations.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-brand-line px-6 py-4">
                  <span className="text-[13px] text-brand-ink-2">Needs a response ({t.escalations.length})</span>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {t.escalations.map((e) => (
                      <li key={e.id} className="flex items-center gap-3">
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[14px]">“{e.snippet}”</span>
                          <span className="text-[12px] text-brand-ink-2">
                            {e.platform} · {day(e.createdAt)}
                          </span>
                        </span>
                        <form action={resolveCommunityEscalationAction}>
                          <input type="hidden" name="id" value={e.id} />
                          <button type="submit" className={pillClass("secondary", "sm")}>
                            Mark resolved
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}
          <BlindSpots items={blind} />
        </div>
      </div>

      <p className="m-0 text-[14px] text-brand-ink-2">
        Who your audience is (age, where they live, your personas) is in{" "}
        <Link href="/assets/audience" className="text-brand-ink underline underline-offset-4">
          Brand OS → Audience
        </Link>
        .
      </p>
    </div>
  );
}
