import { prisma } from "@/lib/prisma";

/**
 * Phase T2 on top of the ouhers pack (designs PMClient / PMClientCredits / PMClientNotes): the PM's account log (12
 * notes of mixed types, 2 pinned), the client profile, the relationship (last check-in, the next one booked, a 9/10
 * rating, Priya K. as their favourite creative), and 6 months of credit history per balance. Dates follow today: the
 * designs' "d Oct" is today − (15 − d) days. This month's ledger stays as it is, so the balances on Home, Usage and
 * Credits keep reading 14 of 20, 31 of 40 and 240 of 3,000.
 *
 * Demo data only: it writes to the ouhers demo client and nothing else.
 */
const DAY = 86400000;
type Ctx = { clientId: string; now: Date };

export async function seedPhaseT2({ clientId, now }: Ctx) {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { isDemo: true } });
  if (!client.isDemo) throw new Error("Phase T2 demo data is for the ouhers demo client only.");
  const at = (d: number, hour = 10) => new Date(new Date(now.getTime() - (15 - d) * DAY).setHours(hour, 0, 0, 0));
  const staff = async (email: string) => (await prisma.user.findUnique({ where: { email }, select: { id: true } }))?.id ?? null;
  const [teddy, sara, priya, marcus] = await Promise.all([staff("teddy@klingit.com"), staff("sara.n@klingit.com"), staff("priya@klingit.com"), staff("marcus@klingit.com")]);
  const author = teddy ?? (await prisma.staffMember.findFirst({ select: { userId: true } }))?.userId;
  if (!author) return { notes: 0 };
  const project = async (name: string) => (await prisma.project.findFirst({ where: { clientId, name }, select: { id: true } }))?.id ?? null;
  const [ingredient, holiday, film] = await Promise.all([project("Ingredient explainer"), project("Holiday: the soft set"), project("Brand film: dewy by default")]);

  // ─── The relationship: the last check-in, the next one (a Friday about three weeks out), the read ────────────
  await prisma.clientCheckIn.deleteMany({ where: { clientId } });
  const next = new Date(now.getTime() + 21 * DAY);
  next.setDate(next.getDate() + ((5 - next.getDay() + 7) % 7));
  next.setHours(10, 0, 0, 0);
  await prisma.clientCheckIn.createMany({
    data: [
      { clientId, at: at(-21), kind: "kick-off", status: "done", bookedByUserId: author },
      { clientId, at: at(9), kind: "monthly review", status: "done", bookedByUserId: author },
      { clientId, at: next, kind: "monthly review", status: "booked", bookedByUserId: author },
    ],
  });
  const nextLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(next);

  // ─── The account log: 12 notes, 2 pinned ─────────────────────────────────────────────────────────────────────
  await prisma.clientNote.deleteMany({ where: { clientId } });
  const notes: { kind: string; title: string; body: string; tags?: string[]; by?: string | null; d: number; projectId?: string | null; pinned?: boolean; durationMin?: number; kickoff?: boolean }[] = [
    { kind: "meeting", title: "Maja wants fewer, bigger campaigns in 2027", body: `Monthly review. Happy with the brand film. Wants 4 big moments a year instead of a steady stream. Budget for 2027 decided in December. Next review ${nextLabel}.`, tags: ["2027 planning", "Upsell"], d: 9, pinned: true },
    { kind: "decision", title: "Never print product shots without the ingredient flag", body: "Applies to all print and retail. Added to Brand OS rules as “must”.", tags: ["Brand rule"], d: 12, projectId: ingredient },
    { kind: "risk", title: "Creative credits keep running out", body: "Third pack request in 3 months. Raise a bigger pack at the next review; don't push before Black Friday.", tags: ["Credits"], d: 12 },
    { kind: "call", title: "Call with Maja about the Halloween reel", body: "She'll brief it herself but wants our motion designer. Brief due 16 Oct.".replace("16 Oct", new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(at(16))), d: 8, durationMin: 15 },
    { kind: "note", title: "Priya is their favourite creative", body: "Maja asked for Priya again on the holiday set. Try to keep her on ouhers video work.", tags: ["Staffing"], by: sara, d: 2, pinned: true, projectId: holiday },
    { kind: "decision", title: "Black Friday: Stories, not discounts", body: "Maja doesn't want to go below 20% off. We lead with Story ads and the gift set instead.", tags: ["Black Friday"], d: 6 },
    { kind: "note", title: "Erik likes short messages", body: "One line and a link works best. He reads Messages on his phone between store visits.", tags: ["Preferences"], d: 4 },
    { kind: "call", title: "Sofia: retail buyers liked the Q4 deck", body: "Two department stores asked for the sell-in deck again. Use it for the spring range too.", tags: ["Retail"], d: 11, durationMin: 20 },
    { kind: "meeting", title: "Brand film review with the team", body: "Cut-downs for 9:16 and 1:1 approved. Maja wants the 6-second version for TikTok.", by: marcus ?? author, d: 10, projectId: film },
    { kind: "risk", title: "TikTok has been disconnected for weeks", body: "Ask Erik to reconnect before the refill launch, or TikTok results stay missing in Insights.", tags: ["Connections"], d: 13 },
    { kind: "note", title: "Finland: wait for the FI section in Brand OS", body: "Copy in Finnish needs its own tone rules first. Planned for the kick-off of the Finland launch.", tags: ["Finland"], d: 3 },
    { kind: "meeting", title: "Kick-off for the Enterprise pack", body: "Moved from the Growth plan. Goals, audience and what good looks like agreed; monthly reviews on Thursdays.", tags: ["Onboarding"], d: -21, kickoff: true },
  ];
  await prisma.clientNote.createMany({
    data: notes.map((n, i) => ({
      clientId,
      authorUserId: n.by ?? author,
      kind: n.kind,
      title: n.title,
      body: n.body,
      tags: n.tags ?? [],
      projectId: n.projectId ?? null,
      pinnedAt: n.pinned ? new Date(at(n.d).getTime() + i * 1000) : null,
      durationMin: n.durationMin ?? null,
      kickoff: Boolean(n.kickoff),
      createdAt: new Date(at(n.d).getTime() + i * 60_000),
    })),
  });

  // ─── The profile, its key dates in the Planner, and the relationship ────────────────────────────────────────
  const y = now.getFullYear();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const blackFriday = (() => {
    const d = new Date(Date.UTC(y, 10, 1));
    // The day after the fourth Thursday of November.
    d.setUTCDate(1 + ((4 - d.getUTCDay() + 7) % 7) + 22);
    return d;
  })();
  const keyDates = [
    { name: "Black Friday", date: iso(blackFriday) },
    { name: "Christmas gifting", date: `${y}-12-10` },
    { name: "Spring launch", date: `${y + 1}-03-16` },
  ];
  const profile = {
    goal: "Become the go-to “real skin” brand in the Nordics; +40% online sales",
    measures: "Saves and shares, online sales, community sign-ups",
    keyDates,
    markets: "SE, NO, DK",
    preferences: { tone: "Calm tone, real skin, no heavy discounts", contact: "Short messages", decisionDay: "Thursdays" },
    tools: "Shopify, Klaviyo, HubSpot, Meta, Figma",
    links: [
      { label: "Brand drive", url: "https://drive.ouhers.demo/brand" },
      { label: "Figma", url: "https://figma.ouhers.demo/brand-system" },
      { label: "Shopify", url: "https://admin.ouhers.demo" },
    ],
    cameFrom: "migrated Sept 2026",
    clientSince: new Date(Date.UTC(2024, 2, 1)),
    read: "happy",
    readAt: at(9),
    readByUserId: author,
    satisfaction: 9,
    satisfactionAt: at(2),
    favourites: priya ? [priya] : [],
    updatedByUserId: author,
  };
  await prisma.clientProfile.upsert({ where: { clientId }, update: profile, create: { clientId, ...profile } });
  await prisma.keyMoment.deleteMany({ where: { clientId } });
  const market = await prisma.keyMoment.findMany({ where: { clientId: null }, select: { name: true } });
  await prisma.keyMoment.createMany({ data: keyDates.filter((k) => !market.some((m) => m.name === k.name)).map((k) => ({ clientId, name: k.name, date: new Date(`${k.date}T09:00:00Z`), markets: ["SE", "NO", "DK"], kind: "client" })) });

  // ─── 6 months of credit history (the five full months before this one) ─────────────────────────────────────
  // Before the contract started (October) the rows are history only: they never count against today's balances.
  const months = Array.from({ length: 5 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1));
  const contract = await prisma.contract.findFirst({ where: { clientId, status: { in: ["active", "paused", "ending"] } }, orderBy: { startDate: "desc" }, select: { startDate: true } });
  const before = months.filter((m) => !contract || m < new Date(contract.startDate.getFullYear(), contract.startDate.getMonth(), 1));
  const PM = [12, 15, 18, 14, 19];
  const CREATIVE = [30, 36, 41, 44, 22];
  const AI = [900, 1100, 1300, 700, 2400];
  const pmWork = ["Planning and check-ins", "Briefs and estimates", "Feedback rounds"];
  const projects = ["Summer: sun day, every day", "lip ours: you voted", "Launch: the first five", "Holiday: the soft set", "Brand film: dewy by default"];
  const projectIds = new Map((await prisma.project.findMany({ where: { clientId, name: { in: projects } }, select: { id: true, name: true } })).map((p) => [p.name, p.id]));
  for (const [i, m] of months.entries()) {
    const end = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    const inMonth = { gte: m, lt: end };
    if (before.includes(m)) {
      await prisma.creditLedgerEntry.deleteMany({ where: { clientId, type: "CONSUMPTION", createdAt: inMonth } });
      const split = (total: number, parts: number) => Array.from({ length: parts }, (_, k) => Math.floor(total / parts) + (k < total % parts ? 1 : 0));
      const rows = [
        ...split(PM[i], 3).map((amount, k) => ({ pool: "pm", amount, note: `${pmWork[k]} · ${m.toISOString().slice(0, 7)}`, projectId: null as string | null, day: 6 + k * 7 })),
        ...split(CREATIVE[i], 2).map((amount, k) => ({ pool: "creative", amount, note: "Project", projectId: projectIds.get(projects[(i + k) % projects.length]) ?? null, day: 9 + k * 10 })),
      ];
      for (const r of rows) await prisma.creditLedgerEntry.create({ data: { clientId, pool: r.pool, type: "CONSUMPTION", amount: -r.amount, balanceAfter: 0, note: r.note, projectId: r.projectId, createdAt: new Date(m.getFullYear(), m.getMonth(), r.day, 11) } });
    }
    // AI use per month, by skill (only billable use counts).
    await prisma.aiCreditLedger.deleteMany({ where: { clientId, kind: "USAGE", createdAt: inMonth } });
    const skills: [string, number][] = [["Ad gen", 0.45], ["Carousel builder", 0.3], ["Instagram caption", 0.25]];
    for (const [k, [name, share]] of skills.entries()) {
      const credits = Math.round(AI[i] * share);
      await prisma.aiCreditLedger.create({ data: { clientId, kind: "USAGE", amount: -credits, fundedBy: "allowance", sourceType: "skill", sourceKey: name.toLowerCase().replace(/\s+/g, "-"), sourceName: name, billedTo: "klingit", billable: true, model: "claude-sonnet-5-5", costUsd: credits * 0.01, note: `${name} · monthly runs`, createdAt: new Date(m.getFullYear(), m.getMonth(), 12 + k * 4, 14) } });
    }
  }
  return { notes: notes.length };
}
