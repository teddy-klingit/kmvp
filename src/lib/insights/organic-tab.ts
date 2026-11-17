import { prisma } from "@/lib/prisma";
import { changePct } from "@/lib/insights/layer";
import { WORK_TZ } from "@/lib/working-hours";
import { jsonArray } from "@/lib/utils";

/**
 * Insights → Organic social (Phase X v2, design Ins4Organic): is the community growing, what content works, when the
 * audience is online, and what the community says. From the client's published posts, follower counts, activity
 * grids and community snapshots.
 */
const DAY = 86400000;
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const SLOTS = ["Morning", "Midday", "Evening"] as const;

/** "Reel", "Short-form video" → Reels; "Carousel" → Carousels; feed and static posts → Single images. */
export function formatGroup(contentType: string | null): "Reels" | "Carousels" | "Single images" | "Stories" | null {
  const t = (contentType ?? "").toLowerCase();
  if (/reel|video/.test(t)) return "Reels";
  if (/carousel/.test(t)) return "Carousels";
  if (/story/.test(t)) return "Stories";
  if (/feed|static|image|post/.test(t)) return "Single images";
  return null;
}

/** Monday-first day (0–6) and time-of-day slot of a moment, in the working time zone. */
export function slotOf(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(d);
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.find((p) => p.type === "weekday")!.value);
  const h = Number(parts.find((p) => p.type === "hour")!.value);
  return { day: wd, slot: h < 11 ? 0 : h < 16 ? 1 : 2 };
}

type Post = { id: string; platform: string; title: string; contentType: string | null; theme: string | null; publishedDate: Date | null; reach: number | null; engagements: number | null; saves: number | null; shares: number | null; videoViews: number | null };

export async function loadOrganicTab(clientId: string, opts: { days: number; now?: Date }) {
  const now = opts.now ?? new Date();
  const start = new Date(now.getTime() - opts.days * DAY);
  const prevStart = new Date(now.getTime() - 2 * opts.days * DAY);
  const [posts, followers, activity, community, openEscalations, accountReach] = await Promise.all([
    prisma.contentPost.findMany({ where: { clientId, status: "PUBLISHED", channelType: "ORGANIC", publishedDate: { gte: prevStart, lte: now } }, select: { id: true, platform: true, title: true, contentType: true, theme: true, publishedDate: true, reach: true, engagements: true, saves: true, shares: true, videoViews: true } }),
    prisma.followerSnapshot.findMany({ where: { clientId, capturedAt: { gte: new Date(prevStart.getTime() - 7 * DAY) } }, orderBy: { capturedAt: "asc" } }),
    prisma.audienceActivity.findMany({ where: { clientId }, orderBy: { capturedAt: "desc" }, take: 6 }),
    prisma.communityManagementSnapshot.findFirst({ where: { clientId, periodEnd: { gte: start } }, orderBy: { periodEnd: "desc" } }),
    prisma.communityEscalation.findMany({ where: { clientId, status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 5 }),
    // Account reach as the platforms report it (people reached by the account, not the sum of each post's reach).
    prisma.metricDaily.findMany({ where: { clientId, source: { in: ["Instagram", "TikTok", "LinkedIn", "Facebook"] }, metric: "reach", date: { gte: prevStart.toISOString().slice(0, 10), lte: now.toISOString().slice(0, 10) } }, select: { date: true, value: true } }),
  ]);
  // Only posts the platform reported reach for count (a post with no numbers yet is left out, never a zero).
  const cur = posts.filter((p) => p.publishedDate! >= start && p.reach !== null);
  const prev = posts.filter((p) => p.publishedDate! < start && p.reach !== null);
  const add = (xs: Post[], k: keyof Pick<Post, "reach" | "engagements" | "saves" | "shares">) => xs.reduce((a, p) => a + (p[k] ?? 0), 0);
  const reach = add(cur, "reach");
  const reachPrev = add(prev, "reach");
  const er = (xs: Post[]) => (add(xs, "reach") ? (add(xs, "engagements") / add(xs, "reach")) * 100 : null);
  const ss = (xs: Post[]) => add(xs, "saves") + add(xs, "shares");
  const hasPrev = prev.length > 0;

  // Followers: the latest count per channel, and growth since the start of the period.
  const platforms = [...new Set(followers.map((f) => f.platform))];
  const latestAt = (p: string, before?: Date) => [...followers].reverse().find((f) => f.platform === p && (!before || f.capturedAt <= before));
  const followersNow = platforms.reduce((a, p) => a + (latestAt(p)?.followerCount ?? 0), 0);
  const followersStart = platforms.every((p) => latestAt(p, start)) ? platforms.reduce((a, p) => a + (latestAt(p, start)?.followerCount ?? 0), 0) : null;

  const slices = Array.from({ length: 6 }, (_, i) => {
    const from = new Date(start.getTime() + (i * opts.days * DAY) / 6);
    const to = new Date(start.getTime() + ((i + 1) * opts.days * DAY) / 6);
    return cur.filter((p) => p.publishedDate! >= from && p.publishedDate! < to);
  });
  const followerSpark = Array.from({ length: 6 }, (_, i) => platforms.reduce((a, p) => a + (latestAt(p, new Date(start.getTime() + ((i + 1) * opts.days * DAY) / 6))?.followerCount ?? 0), 0));

  // The same day boundaries as the data layer: the period is the last `days` days including today.
  const startIso = new Date(now.getTime() - (opts.days - 1) * DAY).toISOString().slice(0, 10);
  const account = accountReach.length ? { cur: accountReach.filter((r) => r.date >= startIso).reduce((a, r) => a + r.value, 0), prev: accountReach.filter((r) => r.date < startIso).reduce((a, r) => a + r.value, 0) } : null;
  const accountSpark = Array.from({ length: 6 }, (_, i) => {
    const from = new Date(start.getTime() + (i * opts.days * DAY) / 6).toISOString().slice(0, 10);
    const to = new Date(start.getTime() + ((i + 1) * opts.days * DAY) / 6).toISOString().slice(0, 10);
    return accountReach.filter((r) => r.date >= from && r.date < to).reduce((a, r) => a + r.value, 0);
  });
  const numbers = {
    reach: account
      ? { value: account.cur, change: account.prev ? changePct(account.cur, account.prev) : null, spark: accountSpark }
      : { value: reach, change: hasPrev ? changePct(reach, reachPrev) : null, spark: slices.map((xs) => add(xs, "reach")) },
    followers: { value: followersNow, growth: followersStart !== null ? followersNow - followersStart : null, spark: followerSpark },
    engagement: { value: er(cur), previous: hasPrev ? er(prev) : null, spark: slices.map((xs) => er(xs) ?? 0) },
    savesShares: { value: ss(cur), change: hasPrev ? changePct(ss(cur), ss(prev)) : null, spark: slices.map(ss) },
  };

  // What content works: average reach per post by format (with how many went out, now vs before), saves by theme.
  const formats = (["Reels", "Carousels", "Single images"] as const)
    .map((f) => {
      const now_ = cur.filter((p) => formatGroup(p.contentType) === f);
      const before = prev.filter((p) => formatGroup(p.contentType) === f);
      return { format: f, avgReach: now_.length ? add(now_, "reach") / now_.length : 0, posted: now_.length, postedBefore: hasPrev ? before.length : null };
    })
    .filter((f) => f.posted || f.postedBefore);
  const themeNames = [...new Set(cur.map((p) => p.theme).filter((t): t is string => Boolean(t)))];
  const themes = themeNames
    .map((t) => {
      const xs = cur.filter((p) => p.theme === t);
      return { theme: t, savesPerPost: add(xs, "saves") / xs.length };
    })
    .sort((a, b) => b.savesPerPost - a.savesPerPost);

  const top = [...cur].sort((a, b) => (b.reach ?? b.videoViews ?? 0) - (a.reach ?? a.videoViews ?? 0)).slice(0, 3);

  // When the audience is online: the newest grid (Instagram first), its best slot, and posts that went out in its quietest.
  const grid = (activity.find((a) => a.platform === "Instagram") ?? activity[0])?.grid as number[][] | undefined;
  let activityRead: { grid: number[][]; best: { day: number; slot: number }; quietPosts: number; total: number } | null = null;
  if (grid?.length === 7 && grid.every((r) => r.length === 3)) {
    const cells = grid.flatMap((r, day) => r.map((v, slot) => ({ day, slot, v })));
    const best = [...cells].sort((a, b) => b.v - a.v)[0];
    const quiet = new Set([...cells].sort((a, b) => a.v - b.v).slice(0, 4).map((c) => `${c.day}:${c.slot}`));
    const quietPosts = cur.filter((p) => {
      const s = slotOf(p.publishedDate!);
      return quiet.has(`${s.day}:${s.slot}`);
    }).length;
    activityRead = { grid, best: { day: best.day, slot: best.slot }, quietPosts, total: cur.length };
  }

  const communityRead = community
    ? {
        positive: community.sentimentPositivePct,
        neutral: community.sentimentNeutralPct,
        negative: community.sentimentNegativePct,
        comments: community.commentVolume + community.dmVolume,
        questions: jsonArray<{ question: string; count: number }>(community.questions).slice(0, 3),
      }
    : null;

  return { numbers, formats, themes, top, activity: activityRead, community: communityRead, escalations: openEscalations, platforms: [...new Set([...platforms, ...cur.map((p) => p.platform)])], posts: cur.length };
}
export type OrganicTab = Awaited<ReturnType<typeof loadOrganicTab>>;
