import { prisma } from "@/lib/prisma";
import { planFor } from "@/lib/ai-credits";
import { loadPricing, monthlyPrice, formatMoney, type Currency, isCurrency } from "@/lib/pricing";
import { createContract } from "@/lib/contracts";
import { notifyMany } from "@/lib/notifier";

/**
 * Migration preview (Phase S, S8): for every real client not on a contract yet, today's setup and a proposed
 * contract. Read-only: nothing here changes a client. Each client is moved only after a person decides, one at a
 * time (and a negotiated override is never carried over without that decision).
 *
 * The proposal: team credits a month → the nearest PM + creative pack by total credits (Per request when there are
 * no team credits but active work, or more than the biggest pack); no team work → platform only. Packs need
 * Enterprise. Start: the next renewal date, or the 1st of next month. 12 months, quarterly, the plan's currency.
 * Contact person: the account lead.
 */

export type Way = 1 | 2 | 3;
export type Proposal = { way: Way; planKey: string; planName: string; aiCredits: number; packKey: string | null; packName: string | null; platform: number; team: number | null; total: number | null };
export type MigrationRow = {
  clientId: string;
  name: string;
  status: string;
  current: { plan: string; teamCredits: number; planTeamCredits: number; override: number | null; aiCredits: number; slots: number; renewal: Date | null; price: number | null; currency: string; activeProjects: number; balance: number };
  proposed: Proposal & { start: Date; termMonths: number; invoicing: "quarterly"; currency: Currency; contact: { id: string; name: string } | null };
  /** With the plan's own team credits instead of the override, when the two differ. */
  withoutOverride: Proposal | null;
  flags: string[];
};

const TOO_BIG = 1.25;

export type Migrated = { id: string; name: string; status: string; start: Date; emailDraft: string | null };

export async function migrationPreview(now = new Date()): Promise<{ rows: MigrationRow[]; migrated: Migrated[] }> {
  const [clients, pricing] = await Promise.all([
    prisma.client.findMany({
      where: { isDemo: false, status: { not: "OFFBOARDED" } },
      include: { accountLead: { include: { user: { select: { name: true } } } }, projects: { where: { status: { notIn: ["ARCHIVED", "DELIVERED", "DRAFT"] } }, select: { id: true } }, contracts: { select: { id: true, status: true, startDate: true }, orderBy: { startDate: "desc" } } },
      orderBy: { name: "asc" },
    }),
    loadPricing(),
  ]);
  const packs = pricing.packs.filter((p) => p.active && p.creativeCredits > 0 && !p.perRequest && p.priceEur != null).sort((a, b) => a.pmCredits + a.creativeCredits - (b.pmCredits + b.creativeCredits));
  const perRequest = pricing.packs.find((p) => p.perRequest && p.active) ?? null;
  const planByKey = (k: string) => pricing.plans.find((p) => p.key === k)!;

  const propose = (teamCredits: number, activeProjects: number, ai: number, ownModel: boolean, currency: Currency): Proposal => {
    const biggest = packs[packs.length - 1];
    let pack: (typeof pricing.packs)[number] | null = null;
    if (teamCredits <= 0) pack = activeProjects > 0 ? perRequest : null;
    else if (biggest && teamCredits > (biggest.pmCredits + biggest.creativeCredits) * TOO_BIG) pack = perRequest;
    else pack = packs.reduce((best, p) => (Math.abs(p.pmCredits + p.creativeCredits - teamCredits) < Math.abs(best.pmCredits + best.creativeCredits - teamCredits) ? p : best), packs[0]);
    // A pack needs its platform plan (Enterprise); platform only: the plan nearest today's AI credits.
    const platforms = pricing.plans.filter((p) => !p.ownModel).sort((a, b) => Math.abs(a.aiCreditsPerMonth - ai) - Math.abs(b.aiCreditsPerMonth - ai));
    const plan = pack ? planByKey(pack.requiresPlanKey) : ownModel ? (pricing.plans.find((p) => p.ownModel) ?? platforms[0]) : platforms[0];
    const price = monthlyPrice(pricing, { planKey: plan.key, packKey: pack?.key ?? null, term: 12, currency });
    return { way: !pack ? 1 : pack.creativeCredits > 0 || pack.perRequest ? 3 : 2, planKey: plan.key, planName: plan.name, aiCredits: plan.aiCreditsPerMonth, packKey: pack?.key ?? null, packName: pack?.name ?? null, platform: price.platform, team: price.team, total: price.total };
  };

  const rows: MigrationRow[] = [];
  const migrated: Migrated[] = [];
  const drafts = await prisma.auditLog.findMany({ where: { area: "migration", clientId: { in: clients.map((c) => c.id) } }, orderBy: { createdAt: "desc" }, select: { clientId: true, after: true } });
  for (const c of clients) {
    if (c.contracts.length) {
      const d = drafts.find((x) => x.clientId === c.id)?.after as { emailDraft?: string } | null;
      migrated.push({ id: c.id, name: c.name, status: c.contracts[0].status, start: c.contracts[0].startDate, emailDraft: d?.emailDraft ?? null });
      continue;
    }
    const plan = await planFor(c.planTier);
    const currency: Currency = isCurrency(plan.currency) ? plan.currency : "EUR";
    const teamCredits = c.teamCreditsOverride ?? plan.monthlyTeamCredits;
    const proposed = propose(teamCredits, c.projects.length, plan.monthlyAiCredits, plan.ownModel, currency);
    const withoutOverride = c.teamCreditsOverride != null && c.teamCreditsOverride !== plan.monthlyTeamCredits ? propose(plan.monthlyTeamCredits, c.projects.length, plan.monthlyAiCredits, plan.ownModel, currency) : null;
    const start = c.renewalDate && c.renewalDate > now ? c.renewalDate : new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const contact = c.accountLead ? { id: c.accountLead.id, name: c.accountLead.user.name } : null;
    const flags: string[] = [];
    if (c.teamCreditsOverride != null) flags.push(`Override: ${c.teamCreditsOverride} team credits a month on ${plan.name} (the plan gives ${plan.monthlyTeamCredits}). Not carried over without your decision.`);
    if (!c.renewalDate) flags.push("No renewal date recorded: proposed start is the 1st of next month.");
    else if (c.renewalDate <= now) flags.push(`The renewal date (${c.renewalDate.toISOString().slice(0, 10)}) has passed: proposed start is the 1st of next month.`);
    if (!contact && proposed.packKey) flags.push("No account lead: a team pack needs a contact person (Marketing PM). Pick one.");
    if (proposed.aiCredits < plan.monthlyAiCredits) flags.push(`AI credits go down: ${plan.monthlyAiCredits.toLocaleString("en-GB")} today, ${proposed.aiCredits.toLocaleString("en-GB")} on ${proposed.planName}.`);
    if (teamCredits <= 0 && c.projects.length > 0) flags.push(`No team credits but ${c.projects.length} active project${c.projects.length === 1 ? "" : "s"}: proposed Per request.`);
    if (plan.priceAmount == null) flags.push("No price recorded today (the old plan's price was never set), so there is nothing to compare the new total with.");
    if (c.creditBalance !== 0) flags.push(`Old team credit balance: ${c.creditBalance}. Decide whether it carries into the new ledgers (default: it doesn't).`);
    flags.push("Term not recorded today: 12 months proposed.");
    rows.push({
      clientId: c.id,
      name: c.name,
      status: c.status,
      current: { plan: plan.name, teamCredits, planTeamCredits: plan.monthlyTeamCredits, override: c.teamCreditsOverride, aiCredits: plan.monthlyAiCredits, slots: plan.activeSlots, renewal: c.renewalDate, price: plan.priceAmount, currency: plan.currency, activeProjects: c.projects.length, balance: c.creditBalance },
      proposed: { ...proposed, start, termMonths: 12, invoicing: "quarterly", currency, contact },
      withoutOverride,
      flags,
    });
  }
  return { rows, migrated };
}

const longDay = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(d);

/** The email the contact person sends the client about the move. A draft only: the app never sends it. */
export function migrationEmailDraft(r: MigrationRow, p: Proposal, contactName: string) {
  const money = (n: number) => formatMoney(n, r.proposed.currency);
  const team = p.packName ? (p.team != null ? `${p.packName}: ${money(p.team)} a month` : `${p.packName}: team work priced per job`) : "no team pack";
  return [
    `Subject: Your Klingit plan from ${longDay(r.proposed.start)}`,
    "",
    "Hi,",
    "",
    `From ${longDay(r.proposed.start)} your Klingit plan moves to our new setup:`,
    `- Platform: ${p.planName}, ${money(p.platform)} a month, ${p.aiCredits.toLocaleString("en-GB")} AI credits a month.`,
    `- Team: ${team}.`,
    `- ${r.proposed.termMonths} months, invoiced ${r.proposed.invoicing}, in ${r.proposed.currency}. Prices are locked for the term.`,
    "",
    "Marketing PM and creative credits are kept separately and roll over up to 150% of a month. Until the start date nothing changes.",
    "You can see the details in Klingit under Settings → Plan.",
    "",
    "Best,",
    contactName,
  ].join("\n");
}

/**
 * Moves one client to a contract (after a person decided): the proposal, with or without the override's credits.
 * The contract starts on the proposed date (scheduled until then, so today's setup keeps running). Logged in the
 * AuditLog with before, after and the email draft; the client's admins get an in-app notice.
 */
export async function applyMigration(clientId: string, opts: { useOverride: boolean }, actorUserId: string | null, now = new Date()) {
  const { rows } = await migrationPreview(now);
  const r = rows.find((x) => x.clientId === clientId);
  if (!r) throw new Error("This client is already on a contract, or isn't a real client.");
  const p = opts.useOverride || !r.withoutOverride ? r.proposed : r.withoutOverride;
  if (p.packKey && !r.proposed.contact) throw new Error("Pick a Marketing PM for this client first: a team pack needs a contact person.");
  const contract = await createContract({ clientId, platformPlanKey: p.planKey, teamPackKey: p.packKey, termMonths: r.proposed.termMonths, startDate: r.proposed.start, currency: r.proposed.currency, invoicing: r.proposed.invoicing, contactStaffId: p.packKey ? r.proposed.contact!.id : (r.proposed.contact?.id ?? null) }, actorUserId, now);
  const emailDraft = migrationEmailDraft(r, p, r.proposed.contact?.name ?? "Klingit");
  await prisma.auditLog.create({
    data: { clientId, actorUserId, area: "migration", action: "moved to a contract", before: r.current as object, after: { contractId: contract.id, way: p.way, planKey: p.planKey, packKey: p.packKey, start: r.proposed.start, termMonths: r.proposed.termMonths, total: p.total, currency: r.proposed.currency, usedOverride: opts.useOverride && Boolean(r.withoutOverride), emailDraft } },
  });
  const admins = await prisma.clientUser.findMany({ where: { clientId, permission: "OWNER" }, select: { userId: true } });
  await notifyMany(admins.map((a) => ({ userId: a.userId, clientId, type: "SYSTEM" as const, title: `Your new plan starts ${longDay(r.proposed.start)}`, body: `${p.planName}${p.packName ? ` with ${p.packName}` : ""}, ${r.proposed.termMonths} months. Until then nothing changes.`, actionUrl: "/settings/plan", actionLabel: "See your plan" })));
  return { contract, emailDraft, proposal: p };
}
