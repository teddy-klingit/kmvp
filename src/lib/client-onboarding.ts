import { prisma } from "@/lib/prisma";
import { platformStatus } from "@/lib/brand-completeness";
import { getProfile, kickoffLogged } from "@/lib/client-notes";

/**
 * Phase T2: "Getting {client} started" — the onboarding checklist on a new client's Overview, and the status pill in
 * the client page header (Onboarding until the checklist is done or 30 days after the contract starts, then Active;
 * Paused and Ending from the contract). Steps tick themselves from real data wherever there is some.
 */
const DAY = 86400000;
const dm = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);
const month = (d: Date) => new Intl.DateTimeFormat("en-GB", { month: "long" }).format(d);

export type StepKey = "contract" | "login" | "kickoff" | "brand" | "channels" | "planner" | "brief";
export type Step = { key: StepKey; title: string; detail: string; done: boolean; action: { label: string; href: string } | null };
export type ClientStatus = "Onboarding" | "Active" | "Paused" | "Ending" | null;

export async function onboarding(clientId: string, now = new Date()) {
  const [client, contract, owner, sessions, connections, sources, briefs, profile, kickoff] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { name: true, brandSummary: true, brandOS: true, onboardingCompletedAt: true } }),
    prisma.contract.findFirst({ where: { clientId, status: { in: ["active", "paused", "ending", "scheduled"] } }, orderBy: { startDate: "asc" } }),
    prisma.clientUser.findFirst({ where: { clientId, permission: "OWNER" }, include: { user: { select: { id: true, name: true, status: true, lastSeenAt: true } } } }),
    prisma.session.count({ where: { user: { clientUser: { clientId } } } }).catch(() => 0),
    prisma.brandConnection.count({ where: { clientId, status: "CONNECTED", app: { notIn: ["claude", "openai"] } } }),
    prisma.dataSource.count({ where: { clientId, status: { in: ["connected", "needs_reconnect"] } } }),
    prisma.brief.count({ where: { project: { clientId, status: { not: "DRAFT" } } } }),
    getProfile(clientId),
    kickoffLogged(clientId),
  ]);
  const plan = contract ? await prisma.platformPlan.findUnique({ where: { key: contract.platformPlanKey }, select: { name: true } }) : null;
  const first = owner?.user.name.split(" ")[0] ?? "the client";
  const startMonth = contract && contract.startDate > now ? contract.startDate : now;
  const monthStart = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1);
  const planItems = await prisma.clientCalendarItem.count({ where: { clientId, archivedAt: null, date: { gte: monthStart, lt: new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1) } } });
  const brand = platformStatus({ brandSummary: client.brandSummary, brandOS: client.brandOS });
  const seen = owner?.user.lastSeenAt ?? null;
  const loggedIn = Boolean(seen || owner?.user.status === "ACTIVE" || sessions > 0);
  const keyDates = (profile?.keyDates ?? []).filter((k) => new Date(`${k.date}T12:00:00Z`) >= monthStart).slice(0, 2);
  const ago = seen ? Math.floor((now.getTime() - seen.getTime()) / DAY) : null;
  const base = `/ops/clients/${clientId}`;

  const steps: Step[] = [
    { key: "contract", title: "Contract signed", detail: contract ? [plan?.name, contract.teamPackKey ? `PM + creative ${contract.pmCreditsPerMonth} + ${contract.creativeCreditsPerMonth}` : "platform only", contract.startDate > now ? `starts ${dm(contract.startDate)}` : `since ${dm(contract.startDate)}`].filter(Boolean).join(" · ") : "No contract yet: an admin sets it up in Admin.", done: Boolean(contract), action: null },
    { key: "login", title: `${first} invited and logged in`, detail: loggedIn ? (ago === null ? "Has signed in" : ago === 0 ? "Last seen today" : ago === 1 ? "Last seen yesterday" : `Last seen ${ago} days ago`) : owner ? "Invited, not signed in yet. Nudge them in Messages." : "Nobody invited yet.", done: loggedIn, action: loggedIn ? null : { label: `Message ${first}`, href: `${base}/dashboard?message=1` } },
    { key: "kickoff", title: "Kick-off call", detail: kickoff ? "Logged in the account log" : "Goals, audience, what good looks like. 45 min.", done: kickoff, action: kickoff ? null : { label: `Book with ${first}`, href: `${base}/notes?kind=call#compose` } },
    { key: "brand", title: "Brand OS to 6 of 8 sections", detail: brand.done >= 6 ? `${brand.done} of 8 sections` : `Now ${brand.done} of 8. Import their brand book PDF or fill it in on the call.`, done: brand.done >= 6, action: brand.done >= 6 ? null : { label: "Import brand book", href: `${base}/brand-os` } },
    { key: "channels", title: "Connect channels", detail: connections + sources ? `${connections + sources} connected` : "Meta and LinkedIn give us Insights and Opportunities from day one.", done: connections + sources > 0, action: connections + sources ? null : { label: `Send ${first} the link`, href: `${base}/dashboard?message=1` } },
    { key: "planner", title: `Fill the Planner for ${month(monthStart)}`, detail: planItems ? `${planItems} item${planItems === 1 ? "" : "s"} in ${month(monthStart)}` : keyDates.length ? `Key dates: ${keyDates.map((k) => `${k.name} ${dm(new Date(`${k.date}T12:00:00Z`))}`).join(", ")}.` : "Their key dates and campaigns for the first month.", done: planItems >= 3, action: planItems >= 3 ? null : { label: "Open Planner", href: `${base}/planner` } },
    { key: "brief", title: "First brief", detail: briefs ? `${briefs} brief${briefs === 1 ? "" : "s"} in` : contract && contract.startDate > now ? `Aim: first project briefed by ${dm(contract.startDate)} so credits are used from week one.` : "Aim: a first project briefed this week so credits are used.", done: briefs > 0, action: briefs ? null : { label: "Start a brief", href: `/ops/projects/new?clientId=${clientId}` } },
  ];
  const done = steps.filter((s) => s.done).length;
  // Onboarding until every step is done or 30 days after the start, whichever comes first.
  const within = !contract || contract.startDate > now || now.getTime() - contract.startDate.getTime() < 30 * DAY;
  const onboardingNow = Boolean(contract) && done < steps.length && within && !client.onboardingCompletedAt;
  const status: ClientStatus = !contract ? null : contract.status === "paused" ? "Paused" : contract.status === "ending" ? "Ending" : onboardingNow || contract.status === "scheduled" ? "Onboarding" : "Active";
  const startsIn = contract && contract.startDate > now ? Math.ceil((contract.startDate.getTime() - now.getTime()) / DAY) : null;
  return { steps, done, total: steps.length, status, onboarding: status === "Onboarding", startsIn, first };
}
export type Onboarding = Awaited<ReturnType<typeof onboarding>>;
