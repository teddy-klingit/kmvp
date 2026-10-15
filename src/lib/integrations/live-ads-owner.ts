import { prisma } from "@/lib/prisma";

/**
 * Klingit's live ad-account connections (Meta from env, LinkedIn and Google Ads from their OAuth
 * IntegrationConnection) are platform-wide credentials. Each belongs to at most ONE client: the clientId on its
 * IntegrationConnection row (Meta gets a row of its own, with no token in it; its token stays in the env). Staff
 * set it at /ops/clients/[id]/admin and every change is in the AuditLog. Every fetch of live ad data asks this
 * first, so no client — and no assistant answering a client — ever sees another client's campaigns. A connection
 * without an owner feeds nobody.
 */
export type LiveAdProvider = "meta" | "linkedin" | "google-ads";

export const LIVE_AD_PROVIDERS: { provider: LiveAdProvider; platform: string }[] = [
  { provider: "meta", platform: "Meta" },
  { provider: "linkedin", platform: "LinkedIn" },
  { provider: "google-ads", platform: "Google Ads" },
];

export async function liveAdsOwner(provider: LiveAdProvider): Promise<string | null> {
  const connection = await prisma.integrationConnection.findUnique({ where: { provider }, select: { clientId: true } });
  return connection?.clientId ?? null;
}

export async function ownsLiveAds(clientId: string | null | undefined, provider: LiveAdProvider) {
  return Boolean(clientId) && (await liveAdsOwner(provider)) === clientId;
}

/** Whether the platform has working credentials for the account (Meta: env; the others: their OAuth row). */
function configured(provider: LiveAdProvider, row: { accessToken: string } | undefined) {
  if (provider === "meta") return Boolean(process.env.META_ADS_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID);
  return Boolean(row?.accessToken);
}

/** The account ID shown to staff (never a token). */
function accountId(provider: LiveAdProvider) {
  if (provider === "meta") return process.env.META_AD_ACCOUNT_ID ?? null;
  if (provider === "linkedin") return process.env.LINKEDIN_AD_ACCOUNT_ID ?? null;
  return null;
}

export type LiveAdAccount = {
  provider: LiveAdProvider;
  platform: string;
  accountId: string | null;
  configured: boolean;
  ownerId: string | null;
  ownerName: string | null;
  connectedAt: Date | null;
  /** Klingit's own account (Phase T): never offered to a client, never on a to-do list. */
  internal: boolean;
};

/** Every live connection with its owner: the ops "Unassigned ad account" rows and the client admin card. */
export async function listLiveAdAccounts(): Promise<LiveAdAccount[]> {
  const rows = await prisma.integrationConnection.findMany({ where: { provider: { in: LIVE_AD_PROVIDERS.map((p) => p.provider) } }, select: { provider: true, clientId: true, accessToken: true, connectedAt: true, internal: true } });
  const owners = new Map((await prisma.client.findMany({ where: { id: { in: rows.flatMap((r) => (r.clientId ? [r.clientId] : [])) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  return LIVE_AD_PROVIDERS.map(({ provider, platform }) => {
    const row = rows.find((r) => r.provider === provider);
    return {
      provider,
      platform,
      accountId: accountId(provider),
      configured: configured(provider, row),
      ownerId: row?.clientId ?? null,
      ownerName: row?.clientId ? (owners.get(row.clientId) ?? null) : null,
      connectedAt: provider === "meta" ? null : (row?.connectedAt ?? null),
      internal: row?.internal ?? false,
    };
  });
}

/** Connected accounts nobody owns: they feed no client until staff assign them. */
export async function unassignedLiveAdAccounts() {
  return (await listLiveAdAccounts()).filter((a) => a.configured && !a.ownerId && !a.internal);
}

/**
 * Assign (clientId) or unassign (null) a live account, logged in the AuditLog with before and after. An account
 * owned by another client must be unassigned there first, so an assignment never silently moves data.
 */
export async function setLiveAdsOwner(provider: LiveAdProvider, clientId: string | null, actorUserId: string): Promise<{ error: string | null }> {
  const accounts = await listLiveAdAccounts();
  const account = accounts.find((a) => a.provider === provider);
  if (!account?.configured) return { error: "That ad account isn't connected." };
  if (clientId && account.ownerId && account.ownerId !== clientId) return { error: `It belongs to ${account.ownerName ?? "another client"}. Unassign it there first.` };
  if (account.ownerId === clientId) return { error: null };
  const client = clientId ? await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } }) : null;
  if (clientId && !client) return { error: "No such client." };

  await prisma.$transaction([
    provider === "meta"
      ? // Meta's token lives in the env: its row only says who owns the account.
        prisma.integrationConnection.upsert({ where: { provider }, update: { clientId }, create: { provider, clientId, accessToken: "" } })
      : prisma.integrationConnection.update({ where: { provider }, data: { clientId } }),
    prisma.auditLog.create({
      data: {
        clientId: clientId ?? account.ownerId,
        actorUserId,
        area: "ad-accounts",
        action: clientId ? `Assigned ${account.platform}${account.accountId ? ` ${account.accountId}` : ""} to ${client!.name}` : `Unassigned ${account.platform}${account.accountId ? ` ${account.accountId}` : ""} from ${account.ownerName ?? "its client"}`,
        before: { provider, ownerId: account.ownerId, ownerName: account.ownerName },
        after: { provider, ownerId: clientId, ownerName: client?.name ?? null },
      },
    }),
  ]);
  return { error: null };
}

/** Admin → To set up: mark an account as Klingit's own (or undo it), logged like an assignment. */
export async function setLiveAdsInternal(provider: LiveAdProvider, internal: boolean, actorUserId: string): Promise<{ error: string | null }> {
  const account = (await listLiveAdAccounts()).find((a) => a.provider === provider);
  if (!account?.configured) return { error: "That ad account isn't connected." };
  if (internal && account.ownerId) return { error: `It belongs to ${account.ownerName ?? "a client"}. Unassign it there first.` };
  await prisma.$transaction([
    provider === "meta" ? prisma.integrationConnection.upsert({ where: { provider }, update: { internal }, create: { provider, accessToken: "", internal } }) : prisma.integrationConnection.update({ where: { provider }, data: { internal } }),
    prisma.auditLog.create({ data: { clientId: null, actorUserId, area: "ad-accounts", action: `${internal ? "Marked" : "Unmarked"} ${account.platform}${account.accountId ? ` ${account.accountId}` : ""} as Klingit internal`, before: { provider, internal: account.internal }, after: { provider, internal } } }),
  ]);
  return { error: null };
}

export type AdDataStatus = "demo" | "sample" | "organic" | "owned" | "none";

/**
 * Where a client's ad numbers come from: a demo's stored days, a sample account, organic only (no paid data at
 * all), a live account it owns, or none — Insights and Ask your data then show "No ad account connected yet".
 */
export async function adDataStatus(clientId: string): Promise<AdDataStatus> {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { isDemo: true, isSampleAccount: true, paidMediaInScope: true } });
  if (!client.paidMediaInScope) return "organic";
  if (client.isDemo) return "demo";
  if (client.isSampleAccount) return "sample";
  const owned = await prisma.integrationConnection.count({ where: { clientId, provider: { in: LIVE_AD_PROVIDERS.map((p) => p.provider) } } });
  return owned > 0 ? "owned" : "none";
}
