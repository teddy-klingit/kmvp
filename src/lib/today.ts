import { prisma } from "@/lib/prisma";
import { loadOpsProjects, rankExceptions, type OpsException, type OpsProject } from "@/lib/ops-exceptions";
import { teamBalances } from "@/lib/team-ledger";
import { REQUEST_KINDS, type RequestKind } from "@/lib/requests";
import { getSetting } from "@/lib/platform-settings";
import { jsonArray } from "@/lib/utils";
import type { Scope } from "@/lib/staff-scope";

/**
 * Today, the Marketing PM's day (Phase T): one row = one decision. Every signal about one project and one kind of
 * decision becomes one task (all quote and number lines on an estimate are one "Price 1 line and check 1" task), a
 * deadline problem is the due tag of the project's task (a row of its own only when nothing else is open there),
 * and duplicate briefs show inside the task. Sections: Do now (late or due today), This week, and Keep an eye on
 * (projects running on their own, a balance that runs out before month end, a renewal or notice within 30 days).
 *
 * Admin jobs never land here (ad accounts nobody owns, migration, clients without a PM), and neither does money:
 * invoices and prices are Admin's (Admin → Billing, To set up). Ticked tasks stay done for the day (TodayDone).
 */

const DAY = 86400000;
export type TaskKind = "ESTIMATE" | "MESSAGE" | "PLAN" | "STAFFING" | "QUALITY CHECK" | "REQUEST" | "DEADLINE" | "INVOICE" | "BRIEF" | "AGENT" | "CHANGES";
export type Due = { tone: "late" | "soon" | "ok"; label: string; at: Date };
export type TaskAction = { label: string; href: string };
export type Task = {
  key: string;
  kind: TaskKind;
  clientId: string;
  clientName: string;
  projectId: string | null;
  subject: string;
  sentence: string;
  context: string;
  due: Due;
  section: "now" | "week";
  minutes: number;
  primary: TaskAction;
  secondary?: TaskAction;
  /** "This brief exists twice (…)": the other copies, merged when the estimate is sent. */
  duplicates?: { id: string; name: string; createdAt: Date }[];
  /** What the inline actions work on. */
  ref: { estimateId?: string; requestId?: string; planItemId?: string; invoiceId?: string; creator?: string | null; panelClientId?: string };
};
export type KeepAnEye = { title: string; line: string; note: string; href?: string };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const shortDay = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
const dayMonth = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const first = (name: string | null | undefined) => (name ?? "").split(" ")[0] || "the client";
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function daysLate(at: Date, now: Date) {
  return Math.max(1, Math.round((startOfDay(now).getTime() - startOfDay(at).getTime()) / DAY));
}
/** A date-based tag: late when past, soon today or tomorrow, otherwise the day. */
export function dueOn(at: Date, now: Date, prefix = "Due"): Due {
  const today = startOfDay(now);
  const p = prefix ? `${prefix} ` : "";
  if (at < today) return { tone: "late", label: `${daysLate(at, now)} day${daysLate(at, now) === 1 ? "" : "s"} late`, at };
  if (at < new Date(today.getTime() + DAY)) return { tone: "soon", label: `${p}today`.replace(/^./, (c) => c.toUpperCase()), at };
  if (at < new Date(today.getTime() + 2 * DAY)) return { tone: "soon", label: `${p}tomorrow`.replace(/^./, (c) => c.toUpperCase()), at };
  return { tone: "ok", label: prefix ? `${prefix} ${dayMonth(at)}` : shortDay(at), at };
}
const isNow = (due: Due, now: Date) => due.tone === "late" || due.at < new Date(startOfDay(now).getTime() + DAY);

export async function loadToday(scope: Scope, now = new Date(), viewer?: { id: string } | null, opts: { ignorePm?: boolean } = {}) {
  // Clients with no Marketing PM are an Admin job (To set up), not anyone's Today. Admin counts their tasks (ignorePm).
  const withPm = opts.ignorePm && scope.clientIds ? scope.clientIds : await clientsWithPm(scope.clientIds);
  const inScope = { clientId: { in: withPm } };
  const [projects, minutes, planItems, briefs, requests] = await Promise.all([
    loadOpsProjects(inScope, now),
    getSetting("todayMinutes"),
    prisma.clientCalendarItem.findMany({ where: { ...inScope, maker: "klingit_help", projectId: null, archivedAt: null, briefBy: { not: null, lte: new Date(now.getTime() + 7 * DAY) }, date: { gte: new Date(now.getTime() - 2 * DAY) } }, include: { client: { select: { name: true } } } }),
    prisma.project.findMany({ where: { ...inScope, status: "BRIEFING", createdAt: { gte: new Date(now.getTime() - 3 * DAY) } }, select: { id: true, name: true, clientId: true, createdAt: true, client: { select: { name: true } } } }),
    prisma.purchaseRequest.findMany({ where: { ...inScope, status: "pending" }, include: { client: { select: { name: true } } } }),
  ]);
  const drafts = await prisma.estimate.findMany({ where: { status: "DRAFT", projectId: { in: projects.map((p) => p.project.id) } }, include: { lineItems: true } });
  const draftOf = (projectId: string) => drafts.find((d) => d.projectId === projectId) ?? null;
  const owners = new Map((await prisma.clientUser.findMany({ where: { id: { in: projects.flatMap((p) => (p.project.createdByClientUserId ? [p.project.createdByClientUserId] : [])) } }, select: { id: true, user: { select: { name: true } } } })).map((c) => [c.id, c.user.name]));
  const mins = (k: TaskKind) => minutes[k] ?? 5;
  // The creator to ask: someone making the work, never the PM.
  const creatorOf = (op: OpsProject) => op.project.team?.members.find((m) => ["ART_DIRECTOR", "COPYWRITER", "MOTION_DESIGNER"].includes(m.staffMember.title))?.staffMember.user.name ?? null;
  const waited = (since: Date) => {
    const d = Math.floor((now.getTime() - since.getTime()) / DAY);
    return d >= 1 ? `Waiting ${d} day${d === 1 ? "" : "s"}` : `Waiting ${Math.max(1, Math.round((now.getTime() - since.getTime()) / 3600000))} h`;
  };

  // Duplicate briefs: the same client, the same project name, both still open. Tasks show on the oldest one.
  const byName = new Map<string, OpsProject[]>();
  for (const p of projects) {
    const k = `${p.project.clientId}|${p.project.name.trim().toLowerCase()}`;
    byName.set(k, [...(byName.get(k) ?? []), p]);
  }
  const keeper = new Map<string, string>();
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const keep = [...group].sort((a, b) => a.project.createdAt.getTime() - b.project.createdAt.getTime())[0];
    for (const p of group) keeper.set(p.project.id, keep.project.id);
  }
  const home = (projectId: string) => keeper.get(projectId) ?? projectId;
  const projectById = new Map(projects.map((p) => [p.project.id, p]));

  // ─── Project tasks: one per project and kind of decision ─────────────────
  const byProject = new Map<string, OpsException[]>();
  for (const e of rankExceptions(projects)) byProject.set(home(e.projectId), [...(byProject.get(home(e.projectId)) ?? []), e]);
  const tasks: Task[] = [];
  for (const [projectId, list] of byProject) {
    const op = projectById.get(projectId)!;
    const p = op.project;
    const base = { clientId: p.clientId, clientName: p.client.name, projectId, subject: p.name };
    const copies = [...keeper.entries()].filter(([id, k]) => k === projectId && id !== projectId).map(([id]) => projectById.get(id)!.project);
    const dupes = copies.length ? copies.map((g) => ({ id: g.id, name: g.name, createdAt: g.createdAt })) : undefined;
    const creator = creatorOf(op);
    const deadline = list.find((e) => e.kind === "deadline_at_risk");
    const deadlineDue = p.dueDate && p.dueDate < startOfDay(now) ? dueOn(p.dueDate, now) : null;
    const of = (kinds: string[]) => list.filter((e) => kinds.includes(e.kind));
    const made: Task[] = [];
    const push = (t: Omit<Task, keyof typeof base | "section" | "minutes">) => {
      // A deadline problem on the same project is this task's due tag, not a row of its own.
      const due = deadlineDue && deadlineDue.at < t.due.at ? deadlineDue : t.due;
      made.push({ ...base, ...t, due, section: isNow(due, now) ? "now" : "week", minutes: mins(t.kind) });
    };

    // Estimate: every quote line, number line and "ready to send" on this project's estimate(s), together.
    const estimates = [projectId, ...copies.map((c) => c.id)].map(draftOf).filter((e): e is NonNullable<typeof e> => Boolean(e));
    const quotes = estimates.flatMap((e) => jsonArray<{ description: string; resolution?: unknown }>(e.unresolvedNeeds).filter((n) => !n.resolution));
    const numbers = estimates.flatMap((e) => e.lineItems.filter((l) => l.needsConfirm && !l.confirmedAt));
    if (of(["out_of_scope", "estimate_send"]).length || quotes.length || numbers.length) {
      const e = estimates[0];
      const parts = [quotes.length ? `price ${plural(quotes.length, "line")}` : null, numbers.length ? `check ${numbers.length}` : null].filter(Boolean);
      const single = numbers.length === 1 && !quotes.length ? numbers[0] : null;
      push({
        key: `ESTIMATE:${projectId}`,
        kind: "ESTIMATE",
        sentence: single ? `Confirm the ${single.deliverable.toLowerCase().replace(/ \(.*\)$/, "")} number` : parts.length ? `${parts.join(" and ").replace(/^./, (c) => c.toUpperCase())} before the estimate goes out` : `Check the estimate and send it to ${p.client.name}`,
        context: single
          ? `${single.deliverable}, ${Math.round((single.credits / Math.max(1, single.quantity)) * 100) / 100} credits × ${single.quantity} = ${single.credits}. Needs your number on the Price List.`
          : `${p.client.name} is waiting for the estimate.${p.dueDate ? ` Due ${dayMonth(p.dueDate)}.` : ""}`,
        due: p.dueDate ? dueOn(p.dueDate, now) : dueOn(new Date((e?.createdAt ?? now).getTime() + DAY), now),
        primary: { label: single ? `Confirm ${single.credits}` : "Price it", href: `/ops/projects/${projectId}?edit=estimate#estimate` },
        secondary: single ? { label: "Change", href: `/ops/projects/${projectId}?edit=estimate#estimate` } : undefined,
        duplicates: dupes,
        ref: { estimateId: e?.id },
      });
    }
    for (const m of of(["client_waiting"]).slice(0, 1)) {
      push({
        key: `MESSAGE:${projectId}`,
        kind: "MESSAGE",
        sentence: `Reply to ${m.title.replace(/ is waiting for a reply$/, "")}`,
        context: m.detail.replace(/ Unanswered for .*$/, ""),
        due: { tone: "late", label: waited(m.since), at: m.since },
        primary: { label: "Reply", href: m.action.href },
        secondary: creator ? { label: `Ask ${creator}`, href: m.action.href } : undefined,
        ref: { creator },
      });
    }
    for (const s of of(["staffing"]).slice(0, 1)) {
      const role = /art director|copywriter|motion designer/i.exec(s.detail)?.[0]?.toLowerCase() ?? "creator";
      push({ key: `STAFFING:${projectId}`, kind: "STAFFING", sentence: `Pick ${/^[aeiou]/.test(role) ? "an" : "a"} ${role}`, context: s.detail, due: { tone: "soon", label: "Staffing", at: startOfDay(now) }, primary: { label: "Pick creators", href: s.action.href }, ref: {} });
    }
    const qc = of(["quality_check"]);
    if (qc.length) {
      const eta = op.state.keyFacts.firstDraftEta;
      const owner = first(p.createdByClientUserId ? owners.get(p.createdByClientUserId) : null);
      push({
        key: `QUALITY CHECK:${projectId}`,
        kind: "QUALITY CHECK",
        sentence: qc[0].title.startsWith("Quality check before sending") ? `Check ${qc[0].title.replace("Quality check before sending ", "")} and send it to ${owner}` : qc[0].title,
        context: qc.map((q) => q.detail).join(" "),
        due: eta ? dueOn(eta, now, "") : { tone: "ok", label: "Waiting", at: qc[0].since },
        primary: { label: "Review and send", href: `/ops/projects/${projectId}/qc` },
        ref: {},
      });
    }
    for (const a of of(["failed_agent"]).slice(0, 1)) push({ key: `AGENT:${projectId}`, kind: "AGENT", sentence: `Check why the ${a.title.replace(/ failed$/, "")} failed`, context: a.detail, due: { tone: "soon", label: "Failed", at: a.since }, primary: { label: "Open project", href: a.action.href }, ref: {} });
    for (const c of of(["second_change_request"]).slice(0, 1)) push({ key: `CHANGES:${projectId}`, kind: "CHANGES", sentence: `Talk to ${p.client.name} about ${c.title.replace(/^Changes asked again on /, "")}`, context: c.detail, due: { tone: "ok", label: "Changes asked twice", at: c.since }, primary: { label: "Open asset", href: c.action.href }, ref: {} });
    if (deadline && made.length === 0) {
      push({
        key: `DEADLINE:${projectId}`,
        kind: "DEADLINE",
        sentence: op.state.stage === "production" ? "Get the first draft back on track" : `Get ${p.name} back on track`,
        context: `${creator ? `${creator} is producing it. ` : ""}${p.dueDate ? `It was due ${dayMonth(p.dueDate)}.` : deadline.detail}`,
        due: p.dueDate ? dueOn(p.dueDate, now) : { tone: "soon", label: "At risk", at: deadline.since },
        primary: { label: creator ? `Ask ${first(creator)} for an update` : "Open project", href: `/ops/projects/${projectId}` },
        secondary: { label: "Move date", href: `/ops/projects/${projectId}` },
        ref: { creator },
      });
    }
    tasks.push(...made);
  }

  // ─── Not about one project's pipeline ────────────────────────────────────
  const planners = new Map((await prisma.user.findMany({ where: { id: { in: planItems.flatMap((i) => (i.createdByUserId ? [i.createdByUserId] : [])) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const tomorrowEnd = new Date(startOfDay(now).getTime() + 2 * DAY);
  for (const i of planItems) {
    const brief = i.briefBy!;
    const late = brief < startOfDay(now);
    const due: Due = late ? { tone: "late", label: `Brief-by passed ${dayMonth(brief)}`, at: brief } : { tone: brief < tomorrowEnd ? "soon" : "ok", label: `Brief by ${shortDay(brief)}`, at: brief };
    const when = brief < new Date(startOfDay(now).getTime() + DAY) ? "today" : brief < tomorrowEnd ? "tomorrow" : `by ${shortDay(brief)}`;
    const who = first(i.createdByUserId ? planners.get(i.createdByUserId) : null);
    tasks.push({
      key: `PLAN:${i.id}`,
      kind: "PLAN",
      clientId: i.clientId,
      clientName: i.client.name,
      projectId: null,
      subject: i.title,
      sentence: late ? `Talk to ${who}: the brief is late` : `Nudge ${who}: the brief is due ${when}`,
      context: `Marked “Klingit’s help needed”. Live ${shortDay(i.date)}. No brief started yet. A reminder is drafted for you.`,
      due,
      // Nudging is due the day before the brief-by date.
      section: brief < tomorrowEnd ? "now" : "week",
      minutes: mins("PLAN"),
      primary: { label: "Send nudge", href: `/ops/planner?item=${i.id}` },
      secondary: { label: "Edit", href: `/ops/planner?item=${i.id}` },
      ref: { planItemId: i.id },
    });
  }
  for (const b of briefs) {
    if (tasks.some((t) => t.projectId === home(b.id))) continue;
    const due = dueOn(new Date(b.createdAt.getTime() + DAY), now);
    tasks.push({ key: `BRIEF:${b.id}`, kind: "BRIEF", clientId: b.clientId, clientName: b.client.name, projectId: b.id, subject: b.name, sentence: "Read the new brief", context: "A new brief came in.", due, section: isNow(due, now) ? "now" : "week", minutes: mins("BRIEF"), primary: { label: "Open brief", href: `/ops/projects/${b.id}#brief` }, ref: {} });
  }
  for (const r of requests) {
    const label = REQUEST_KINDS[r.kind as RequestKind]?.label ?? r.kind;
    const payload = (r.payload ?? {}) as { packs?: number; note?: string };
    tasks.push({
      key: `REQUEST:${r.id}`,
      kind: "REQUEST",
      clientId: r.clientId,
      clientName: r.client.name,
      projectId: null,
      subject: label,
      sentence: r.kind === "creative_pack" ? `Approve ${(payload.packs ?? 1) * 10} extra creative credits` : `Decide: ${label.toLowerCase()}`,
      // Never money on a PM's day: the credit change shows in the row (Creative balance goes 31 → 41).
      context: payload.note ? `“${payload.note}”` : r.kind === "creative_pack" ? "Extra creative credits for this month." : "Asked by the client.",
      due: { tone: "ok", label: `Asked ${dayMonth(r.createdAt)}`, at: r.createdAt },
      section: now.getTime() - r.createdAt.getTime() > 3 * DAY ? "now" : "week",
      minutes: mins("REQUEST"),
      primary: { label: "Approve", href: "/ops/requests" },
      secondary: { label: "Decline", href: "/ops/requests" },
      ref: { requestId: r.id },
    });
  }

  // The client's general thread with their PM (Phase U): a client message with no staff reply after it.
  const general = await prisma.clientMessage.findMany({ where: { ...inScope, archivedAt: null }, orderBy: { createdAt: "asc" }, include: { client: { select: { name: true } } } });
  for (const clientId of [...new Set(general.map((g) => g.clientId))]) {
    const msgs = general.filter((g) => g.clientId === clientId);
    const lastStaff = [...msgs].reverse().find((g) => !g.authorClientUserId);
    const waiting = msgs.filter((g) => g.authorClientUserId && (!lastStaff || g.createdAt > lastStaff.createdAt));
    if (!waiting.length) continue;
    const first = waiting[0];
    const who = (await prisma.clientUser.findUnique({ where: { id: first.authorClientUserId! }, include: { user: { select: { name: true } } } }))?.user.name ?? "the client";
    const quote = waiting[waiting.length - 1].body;
    const hours = (now.getTime() - first.createdAt.getTime()) / 3600000;
    tasks.push({
      key: `MESSAGE:general:${clientId}`,
      kind: "MESSAGE",
      clientId,
      clientName: first.client.name,
      projectId: null,
      subject: "General",
      sentence: `Reply to ${who}`,
      context: `“${quote.length > 110 ? `${quote.slice(0, 107)}…` : quote}”`,
      due: { tone: hours > 4 ? "late" : "soon", label: hours >= 24 ? `Waiting ${Math.floor(hours / 24)} day${hours >= 48 ? "s" : ""}` : `Waiting ${Math.max(1, Math.round(hours))} h`, at: first.createdAt },
      section: "now",
      minutes: mins("MESSAGE"),
      primary: { label: "Reply", href: `/ops/clients/${clientId}/dashboard?message=1` },
      ref: { panelClientId: clientId },
    });
  }

  // Done today (ticked or acted): out of the list, into the bar.
  const done = viewer ? await prisma.todayDone.findMany({ where: { staffId: viewer.id, day: dayKey(now) }, orderBy: { createdAt: "asc" } }) : [];
  const doneKeys = new Set(done.map((d) => d.taskKey));
  const open = tasks.filter((t) => !doneKeys.has(t.key));
  open.sort((a, b) => (a.section === b.section ? 0 : a.section === "now" ? -1 : 1) || (a.due.tone === "late" ? 0 : 1) - (b.due.tone === "late" ? 0 : 1) || a.due.at.getTime() - b.due.at.getTime());

  return { tasks: open, done, projects, keepAnEye: await keepAnEye(projects, withPm, now) };
}

async function clientsWithPm(ids: string[] | null) {
  const clients = await prisma.client.findMany({
    where: { status: { not: "OFFBOARDED" }, ...(ids ? { id: { in: ids } } : {}) },
    select: { id: true, accountLeadId: true, contracts: { where: { status: { in: ["active", "paused", "ending", "scheduled"] }, contactStaffId: { not: null } }, select: { id: true } } },
  });
  return clients.filter((c) => c.accountLeadId || c.contracts.length).map((c) => c.id);
}

/** Not tasks yet: what runs on its own, a balance that won't last the month, a renewal or notice close by. */
async function keepAnEye(projects: OpsProject[], clientIds: string[], now: Date): Promise<KeepAnEye[]> {
  const out: KeepAnEye[] = [];
  const running = projects.filter((p) => p.exceptions.length === 0);
  const next = running
    .map((p) => ({ p, at: p.state.keyFacts.firstDraftEta ?? p.project.dueDate }))
    .filter((x): x is { p: OpsProject; at: Date } => Boolean(x.at && x.at >= startOfDay(now)))
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
  out.push({ title: String(running.length), line: `project${running.length === 1 ? "" : "s"} running on their own`, note: next ? `All on track · next: ${next.p.project.name}, ${shortDay(next.at)}` : running.length ? "All on track" : "Nothing running on its own yet" });

  // A balance that runs out before month end at this month's pace.
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const elapsed = Math.max(1, (now.getTime() - new Date(now.getFullYear(), now.getMonth(), 1).getTime()) / DAY);
  const clients = await prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true, renewalDate: true, contracts: { where: { status: { not: "ended" } }, select: { id: true } } } });
  let soonest: { name: string; pool: string; at: Date; left: number; id: string } | null = null;
  for (const c of clients) {
    const b = await teamBalances(c.id, now);
    if (!b) continue;
    for (const pool of ["creative", "pm"] as const) {
      const s = b[pool];
      const pace = s.used / elapsed;
      if (pace <= 0 || s.left <= 0) continue;
      const at = new Date(now.getTime() + (s.left / pace) * DAY);
      if (at < monthEnd && (!soonest || at < soonest.at)) soonest = { name: c.name, pool, at, left: s.left, id: c.id };
    }
  }
  out.push(
    soonest
      ? { title: soonest.name, line: `${soonest.pool === "pm" ? "PM" : "creative"} credits run out ~ ${dayMonth(soonest.at)}`, note: `${Math.round(soonest.left)} left · a pack suggestion is ready if they ask`, href: `/ops/clients/${soonest.id}/balances` }
      : { title: "Balances", line: "every balance lasts the month", note: "At this month's pace" }
  );

  // Phase U: AI top-ups this month on these clients (instant ones too), so the PM knows who's running hot.
  const topUps = await prisma.purchaseRequest.findMany({ where: { clientId: { in: clientIds }, kind: "ai_topup", status: "approved", createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } }, include: { client: { select: { name: true } } }, orderBy: { createdAt: "desc" } });
  if (topUps.length) {
    const byClient = new Map<string, { n: number; credits: number; auto: number; id: string }>();
    for (const t of topUps) {
      const c = byClient.get(t.client.name) ?? { n: 0, credits: 0, auto: 0, id: t.clientId };
      const p = t.payload as { credits?: number; auto?: boolean };
      byClient.set(t.client.name, { ...c, n: c.n + 1, credits: c.credits + (p.credits ?? 0), auto: c.auto + (p.auto ? 1 : 0) });
    }
    const [name, t] = [...byClient.entries()].sort((a, b) => b[1].credits - a[1].credits)[0];
    out.push({ title: name, line: `${t.n} AI top-up${t.n === 1 ? "" : "s"} this month · ${t.credits.toLocaleString("en-GB")} credits`, note: `${t.auto ? `${t.auto} automatic` : "Added by the client"}${byClient.size > 1 ? ` · +${byClient.size - 1} more client${byClient.size > 2 ? "s" : ""}` : ""}`, href: `/ops/clients/${t.id}/billing` });
  }

  // Notice deadlines within 30 days (contracts), else old plans renewing around now.
  const contracts = await prisma.contract.findMany({ where: { clientId: { in: clientIds }, status: { in: ["active", "paused"] }, autoRenew: true, noticeDeadline: { gte: now, lte: new Date(now.getTime() + 30 * DAY) } }, include: { client: { select: { name: true } } }, orderBy: { noticeDeadline: "asc" } });
  // Old plans only: a client on a contract renews by its contract.
  const old = clients.filter((c) => !c.contracts.length && c.renewalDate && Math.abs(c.renewalDate.getTime() - now.getTime()) <= 30 * DAY).sort((a, b) => a.renewalDate!.getTime() - b.renewalDate!.getTime());
  if (contracts[0]) out.push({ title: contracts[0].client.name, line: `notice by ${dayMonth(contracts[0].noticeDeadline)}`, note: `Renews ${dayMonth(contracts[0].endDate)} unless cancelled`, href: `/ops/clients/${contracts[0].clientId}/contract` });
  else if (old[0]) {
    const passed = old[0].renewalDate! < now;
    out.push({ title: old[0].name, line: passed ? `renews ${dayMonth(old[0].renewalDate!)} → notice passed` : `renews ${dayMonth(old[0].renewalDate!)}`, note: passed ? "Renewed automatically · say hello this month" : "On an old plan · see Admin → Migration", href: `/ops/clients/${old[0].id}/contract` });
  } else out.push({ title: "Renewals", line: "none in the next 30 days", note: "Notice dates are on each contract" });
  return out;
}
