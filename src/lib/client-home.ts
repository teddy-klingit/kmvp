import { prisma } from "@/lib/prisma";
import { clientMilestones, endOfDay, formatDay, shortDate, type ProjectState } from "@/lib/project-state";
import { jsonArray } from "@/lib/utils";
import type { ProjectWithStateData } from "@/lib/project-state-loader";

type Item = { project: ProjectWithStateData; state: ProjectState };

const DAY = 86400000;

function sentence(label: string) {
  const s = label.replace(/^(Your turn|Klingit): /, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function firstName(name: string) {
  return name.split(" ")[0];
}

// ─── Your turn ─────────────────────────────────────────────────────────────

export type TurnItem = {
  id: string;
  kind: "review" | "approve" | "brief" | "signoff" | "other";
  title: string;
  due: { label: string; tone: "danger" | "neutral" } | null;
  /** "Project · detail", for one-line rows. */
  context: string;
  projectName: string;
  detail: string;
  href: string;
  cta: string;
  dueAt: Date | null;
};

/** The client's actions, from getProjectState only — never notifications or market alerts. */
export function yourTurn(items: Item[], now = new Date()): TurnItem[] {
  return items
    .filter(({ state }) => state.ballInCourt === "client" && !state.paused && !state.archived && state.stage !== "closed")
    .map(({ project, state }) => {
      const dueAt = state.nextAction.dueAt ?? state.keyFacts.dueDate ?? null;
      const kind: TurnItem["kind"] =
        state.stage === "review" ? "review" : state.stage === "awaiting_approval" ? "approve" : state.stage === "briefing" ? "brief" : state.stage === "final" ? "signoff" : "other";
      const team = state.keyFacts.staffedTeam;
      const waiting = team.length ? `${team.map((m) => firstName(m.name)).slice(0, 2).join(" and ")} ${team.length === 1 ? "is" : "are"} waiting on your feedback` : null;
      const context =
        kind === "review"
          ? (waiting ?? "Your first draft is ready")
          : kind === "approve"
            ? "First draft 2 days after you approve"
            : kind === "signoff"
              ? "Everything's approved. Sign off to close it"
              : kind === "brief"
                ? state.draft && state.brief.mode === "intake"
                  ? "Your draft brief isn't sent yet"
                  : state.nextAction.description
                : state.nextAction.description;
      let due: TurnItem["due"] = null;
      if (dueAt) {
        if (endOfDay(dueAt).getTime() < now.getTime()) due = { label: "Overdue", tone: "danger" };
        else if (dueAt.toDateString() === now.toDateString()) due = { label: "Due today", tone: "danger" };
        else due = { label: `By ${formatDay(dueAt)}`, tone: "neutral" };
      }
      return {
        id: project.id,
        kind,
        title: sentence(state.nextAction.label).replace(/^Approve estimate \((\d+) credits?\)$/, "Approve estimate · $1 credits"),
        due,
        context: `${project.name} · ${context}`,
        projectName: project.name,
        detail: context,
        href: state.nextAction.href,
        cta: state.nextAction.cta ?? "Open",
        dueAt,
      };
    })
    .sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
}

// ─── In progress ───────────────────────────────────────────────────────────

export type ProgressRow = {
  id: string;
  name: string;
  meta: string;
  steps: ("done" | "current" | "upcoming")[];
  next: string;
  team: string[];
};

export function inProgress(items: Item[], typeLabel: (t: string) => string, accountLead: string | null): ProgressRow[] {
  return items
    .filter(({ state }) => state.stage !== "closed" && !state.archived)
    .map(({ project, state }) => {
      const milestones = clientMilestones(state);
      const current = milestones.find((m) => m.status === "current");
      const assetCount = project.assets.length;
      const eta = state.keyFacts.firstDraftEta;
      const score = state.brief.mode === "studio" ? state.brief.score : null;
      const KLINGIT_NEXT: Partial<Record<ProjectState["stage"], string>> = {
        briefing: "Brief · Klingit is reviewing it",
        estimating: "Estimate · Klingit is pricing it",
        staffing: "Production · Klingit is picking your team",
        production: "Production · in progress",
        review: "Review · Klingit is revising",
        final: "Delivery · final files on the way",
      };
      const next = state.paused
        ? "Paused"
        : state.ballInCourt === "client"
          ? state.stage === "final"
            ? "Sign-off · waiting on you"
            : state.stage === "briefing" && score !== null
              ? `Brief · quality ${score}`
              : `${current?.label ?? "Next step"} · waiting on you`
          : state.stage === "production" && eta
            ? endOfDay(eta).getTime() < Date.now()
              ? `First draft late · was due ${formatDay(eta)}`
              : `First draft ${formatDay(eta)}`
            : (KLINGIT_NEXT[state.stage] ?? `${current?.label ?? "Next step"} · in progress`);
      const team = state.keyFacts.staffedTeam.map((m) => m.name);
      return {
        id: project.id,
        name: project.name,
        meta: [typeLabel(project.type), assetCount ? `${assetCount} asset${assetCount === 1 ? "" : "s"}` : null].filter(Boolean).join(" · "),
        steps: milestones.map((m) => m.status),
        next,
        team: team.length ? team : accountLead ? [accountLead] : [],
      };
    });
}

/** Projects signed off (closed) this calendar month. */
export function deliveredThisMonth(items: Item[], now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return items.filter(({ project, state }) => state.stage === "closed" && project.deliveredAt && project.deliveredAt >= start).length;
}

// ─── Credits ───────────────────────────────────────────────────────────────

export type CreditSummary = {
  month: string;
  allowance: number | null;
  /** Allowance plus this month's purchases and adjustments. */
  available: number | null;
  used: number;
  awaiting: number;
  free: number | null;
};

/**
 * The month's credits from the ledger: used = this month's consumption; awaiting = estimates sent
 * but not yet approved (for a revision, only the extra over the approved version); free = what's left.
 * No allowance on the client = no "left": we never invent one.
 */
export async function creditSummary(clientId: string, now = new Date()): Promise<CreditSummary> {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const [client, ledger, sent] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { monthlyCreditAllowance: true } }),
    prisma.creditLedgerEntry.findMany({ where: { clientId, createdAt: { gte: start } } }),
    prisma.estimate.findMany({
      where: { status: "SENT", project: { clientId, status: { notIn: ["ARCHIVED", "DRAFT"] } } },
      include: { revisions: { where: { status: "APPROVED" }, orderBy: { version: "desc" }, take: 1 } },
    }),
  ]);
  const used = -ledger.filter((e) => e.type === "CONSUMPTION").reduce((n, e) => n + e.amount, 0);
  const extra = ledger.filter((e) => e.type === "PURCHASE" || e.type === "ADJUSTMENT").reduce((n, e) => n + e.amount, 0);
  const awaiting = sent.reduce((n, e) => n + Math.max(0, e.totalCredits - (e.revisions[0]?.totalCredits ?? 0)), 0);
  const allowance = client.monthlyCreditAllowance > 0 ? client.monthlyCreditAllowance : null;
  const available = allowance !== null ? allowance + extra : null;
  return {
    month: new Intl.DateTimeFormat("en-GB", { month: "long" }).format(now),
    allowance,
    available,
    used: Math.max(0, used),
    awaiting,
    free: available !== null ? Math.max(0, available - used - awaiting) : null,
  };
}

// ─── Next 7 days ───────────────────────────────────────────────────────────

export type UpcomingItem = {
  id: string;
  kind: "draft" | "due_client" | "due_klingit" | "estimate" | "touchpoint";
  at: Date;
  title: string;
  sub: string;
  href?: string;
};

export async function nextSevenDays(clientId: string, items: Item[], now = new Date()): Promise<UpcomingItem[]> {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 7 * DAY);
  const within = (d: Date | null | undefined): d is Date => Boolean(d && d >= from && d < to);
  const out: UpcomingItem[] = [];

  for (const { project, state } of items) {
    if (state.stage === "closed" || state.archived) continue;
    const eta = state.keyFacts.firstDraftEta;
    if (state.stage === "production" && within(eta)) {
      out.push({ id: `draft-${project.id}`, kind: "draft", at: eta, title: `First draft: ${project.name}`, sub: "You get a notification when it's ready", href: `/projects/${project.id}` });
    }
    const due = state.keyFacts.dueDate;
    if (within(due)) {
      out.push({
        id: `due-${project.id}`,
        kind: state.ballInCourt === "client" ? "due_client" : "due_klingit",
        at: due,
        title: `${project.name} due`,
        sub: state.ballInCourt === "client" ? `Needs you first: ${sentence(state.nextAction.label).toLowerCase()}` : `Klingit: ${sentence(state.nextAction.label).toLowerCase()}`,
        href: `/projects/${project.id}`,
      });
    }
  }

  const [estimates, touchpoints] = await Promise.all([
    prisma.estimate.findMany({ where: { status: "SENT", expiresAt: { gte: from, lt: to }, project: { clientId, status: { notIn: ["ARCHIVED", "DRAFT"] } } }, include: { project: true } }),
    prisma.touchpoint.findMany({ where: { clientId, scheduledAt: { gte: from, lt: to } } }),
  ]);
  for (const e of estimates) {
    out.push({ id: `est-${e.id}`, kind: "estimate", at: e.expiresAt!, title: `Estimate expires: ${e.project.name}`, sub: `v${e.version} · ${e.totalCredits} credits`, href: `/projects/${e.projectId}` });
  }
  for (const t of touchpoints) {
    out.push({
      id: `tp-${t.id}`,
      kind: "touchpoint",
      at: t.scheduledAt,
      title: t.title,
      sub: new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(t.scheduledAt),
    });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

// ─── Market ────────────────────────────────────────────────────────────────

export type MarketRow = {
  key: "performance" | "competitor" | "other";
  title: string;
  detail: string;
  /** One short line for compact cards. */
  short: string;
  action: { label: string; href: string; primary?: boolean };
};

function pctRange(titles: string[]) {
  const pcts = titles.map((t) => Number(t.match(/down (\d+)%/)?.[1])).filter((n) => Number.isFinite(n) && n > 0);
  if (pcts.length === 0) return null;
  const lo = Math.min(...pcts);
  const hi = Math.max(...pcts);
  return lo === hi ? `${lo}%` : `${lo}–${hi}%`;
}

/** This week's market signals, folded into at most 3 rows: performance drops, competitor activity, everything else. */
export async function marketThisWeek(clientId: string, now = new Date()): Promise<MarketRow[]> {
  const signals = await prisma.marketSignal.findMany({
    where: { clientId, archivedAt: null, publishedAt: { gte: new Date(now.getTime() - 7 * DAY) } },
    orderBy: { publishedAt: "desc" },
  });
  const rows: MarketRow[] = [];

  const perf = signals.filter((s) => s.type === "PERFORMANCE");
  if (perf.length) {
    const platforms = [...new Set(perf.map((s) => s.source).filter(Boolean))];
    const range = pctRange(perf.map((s) => s.title));
    const names = perf.map((s) => s.title.match(/^"(.+?)"/)?.[1]).filter(Boolean) as string[];
    const idea = `Refresh ${perf.length === 1 ? "an ad that's" : `${perf.length} ads that are`} losing clicks`;
    const detail = `${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""}: CTR down ${range ?? "sharply"} vs their own average.`;
    rows.push({
      key: "performance",
      title: `${perf.length} ${platforms.length === 1 ? `${platforms[0]} ` : ""}ad${perf.length === 1 ? " is" : "s are"} losing clicks`,
      detail,
      short: `CTR down ${range ?? "sharply"} vs their own average.`,
      action: { label: "Brief a refresh", href: `/projects/new?idea=${encodeURIComponent(idea)}&detail=${encodeURIComponent(detail)}`, primary: true },
    });
  }

  const comp = signals.filter((s) => s.type === "COMPETITOR");
  if (comp.length) {
    const byBrand = new Map<string, number>();
    let total = 0;
    for (const s of comp) {
      const m = s.title.match(/^(.+?) launched (\d+) new ad/);
      const brand = m?.[1] ?? s.title.split(/['’]s | /)[0];
      const n = m ? Number(m[2]) : 1;
      byBrand.set(brand, (byBrand.get(brand) ?? 0) + n);
      total += n;
    }
    const platforms = [...new Set(comp.map((s) => s.source).filter(Boolean))];
    rows.push({
      key: "competitor",
      title: `Competitors launched ${total} new ${platforms.length === 1 ? `${platforms[0]} ` : ""}ad${total === 1 ? "" : "s"}`,
      detail: [...byBrand.entries()].sort((a, b) => b[1] - a[1]).map(([b, n]) => `${b} ${n}`).join(" · "),
      short: [...byBrand.entries()].sort((a, b) => b[1] - a[1]).map(([b, n]) => `${b} ${n}`).join(" · "),
      action: { label: "See ads", href: "/insights/market/competitors" },
    });
  }

  const other = signals.filter((s) => s.type !== "PERFORMANCE" && s.type !== "COMPETITOR");
  if (other.length) {
    rows.push({
      key: "other",
      title: other.length === 1 ? other[0].title : `${other.length} industry updates`,
      detail: other.length === 1 ? other[0].summary : other.slice(0, 2).map((s) => s.title).join(" · "),
      short: other.length === 1 ? other[0].source ?? "Industry news" : `${other.length} headlines from industry news`,
      action: { label: "Read", href: "/insights/market/trends" },
    });
  }
  return rows;
}

export { shortDate, jsonArray };

// ─── Project rows & board cards (Home "Your projects", Projects board and list) ──

/** Orange = waiting on you, ink = Klingit working, green = done, grey = paused (ds StatusDot tones). */
export type StatusTone = "you" | "klingit" | "done" | "paused";

const KLINGIT_DOING: Partial<Record<ProjectState["stage"], string>> = {
  briefing: "Klingit is reviewing the brief",
  estimating: "Klingit is pricing it",
  staffing: "Picking your team",
  production: "In production",
  review: "Klingit is revising",
  final: "Final files on the way",
};

/**
 * One status in plain words. `row` is Home's wording ("Klingit working · draft Wed"); `card` is the board's
 * ("Draft Wed 7 Oct"). Waiting on you is always orange; nothing else ever is.
 */
export function statusLine(state: ProjectState, now: Date, variant: "row" | "card" = "row"): { label: string; tone: StatusTone; late: boolean } {
  if (state.archived) return { label: "Archived", tone: "paused", late: false };
  if (state.stage === "closed") return { label: "Signed off", tone: "done", late: false };
  if (state.paused) return { label: "Paused", tone: "paused", late: false };
  if (state.ballInCourt === "client") return { label: "Waiting on you", tone: "you", late: false };
  const eta = state.keyFacts.firstDraftEta;
  if (state.stage === "production" && eta) {
    if (endOfDay(eta) < now) return { label: variant === "card" ? `Draft late · was due ${shortDate(eta)}` : "Klingit working · draft late", tone: "klingit", late: true };
    if (variant === "card") return { label: `Draft ${formatDay(eta)}`, tone: "klingit", late: false };
    const soon = eta.getTime() - now.getTime() < 6 * DAY;
    return { label: `Klingit working · draft ${soon ? new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(eta) : shortDate(eta)}`, tone: "klingit", late: false };
  }
  return { label: variant === "card" ? (KLINGIT_DOING[state.stage] ?? "Klingit working") : "Klingit working", tone: "klingit", late: false };
}

export type ProjectRowData = {
  id: string;
  /** Client-turn rows open where the action is; everything else opens the overview. */
  href: string;
  name: string;
  /** "Campaign · 6 assets" */
  meta: string;
  type: string;
  status: { label: string; tone: StatusTone; late: boolean };
  /** The board card's wording ("Draft Wed 7 Oct"). */
  cardStatus: { label: string; tone: StatusTone; late: boolean };
  /** "Review" … "Delivered" (the client timeline). */
  stage: string;
  /** 1–5 on the client timeline. */
  step: number;
  /** "DUE 25 OCT", "2 OCT" once delivered, or "NO DATE YET". */
  dateLabel: string;
  team: string[];
  confidential: boolean;
  draft: boolean;
  projectStatus: string;
};

export function projectRow({ project, state }: Item, typeLabel: (t: string) => string, accountLead: string | null, now = new Date()): ProjectRowData {
  const milestones = clientMilestones(state);
  const currentIdx = milestones.findIndex((m) => m.status === "current");
  const step = currentIdx >= 0 ? currentIdx + 1 : milestones.filter((m) => m.status === "done").length;
  const assetCount = project.assets.length;
  const team = state.keyFacts.staffedTeam.map((m) => m.name);
  const day = (d: Date) => shortDate(d).toUpperCase();
  return {
    id: project.id,
    href: state.ballInCourt === "client" && !state.paused && state.stage !== "closed" ? state.nextAction.href : `/projects/${project.id}`,
    name: project.name,
    meta: [typeLabel(project.type), assetCount ? `${assetCount} asset${assetCount === 1 ? "" : "s"}` : null].filter(Boolean).join(" · "),
    type: typeLabel(project.type),
    status: statusLine(state, now),
    cardStatus: statusLine(state, now, "card"),
    stage: milestones[Math.max(0, step - 1)]?.label ?? "Brief",
    step,
    dateLabel: state.stage === "closed" ? (project.deliveredAt ? day(project.deliveredAt) : "DELIVERED") : state.keyFacts.dueDate ? `DUE ${day(state.keyFacts.dueDate)}` : "NO DATE YET",
    team: team.length ? team : accountLead ? [accountLead] : [],
    confidential: project.confidential,
    draft: state.draft,
    projectStatus: project.status,
  };
}

/** Where "talk to your account lead" goes: the Klingit channel on the client's latest live project (Help if they have none yet). */
export async function klingitChatHref(clientId: string) {
  const p = await prisma.project.findFirst({ where: { clientId, status: { notIn: ["ARCHIVED", "DRAFT"] } }, orderBy: { updatedAt: "desc" }, select: { id: true } });
  return p ? `/projects/${p.id}?channel=klingit` : "/help";
}
