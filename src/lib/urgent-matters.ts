import { prisma } from "@/lib/prisma";

const STALE_SUGGESTION_DAYS = 5;

export type UrgentMatter = {
  id: string;
  kind: "notification" | "suggestion" | "escalation";
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  createdAt: Date;
};

/**
 * Pulls "needs fast attention" items from the systems that already exist —
 * no parallel alerts model. Three sources:
 *  - Notification rows the app already creates for genuinely urgent types
 *    (APPROVAL_NEEDED / SLA_BREACH / AGENT_FAILURE), unread.
 *  - Opportunities still new after several days whose best window opens
 *    within two weeks (Plan → Opportunities).
 *  - CommunityEscalation rows that are OPEN and NEGATIVE — a real
 *    complaint nobody has responded to yet.
 */
export async function computeUrgentMatters(clientId: string, userId: string): Promise<UrgentMatter[]> {
  const staleThreshold = new Date(Date.now() - STALE_SUGGESTION_DAYS * 86400000);

  const [urgentNotifications, staleSuggestions, openEscalations] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, clientId, read: false, type: { in: ["APPROVAL_NEEDED", "SLA_BREACH", "AGENT_FAILURE"] } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.opportunity.findMany({
      where: { clientId, status: "new", hiddenAt: null, createdAt: { lte: staleThreshold }, windowStart: { lte: new Date(Date.now() + 14 * 86400000) } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.communityEscalation.findMany({
      where: { clientId, status: "OPEN", sentiment: "NEGATIVE" },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const daysAgo = (d: Date) => Math.max(1, Math.floor((Date.now() - d.getTime()) / 86400000));

  const items: UrgentMatter[] = [
    ...urgentNotifications.map((n) => ({
      id: `n-${n.id}`,
      kind: "notification" as const,
      title: n.title,
      detail: n.body,
      href: n.actionUrl ?? "/notifications",
      actionLabel: n.actionLabel ?? "View",
      createdAt: n.createdAt,
    })),
    ...staleSuggestions.map((s) => ({
      id: `s-${s.id}`,
      kind: "suggestion" as const,
      title: `New for ${daysAgo(s.createdAt)} days — ${s.title}`,
      detail: "Its best window opens soon. Add it to your plan, brief Klingit, or say it's not for you.",
      href: `/plan/opportunities/${s.id}`,
      actionLabel: "Review",
      createdAt: s.createdAt,
    })),
    ...openEscalations.map((e) => ({
      id: `e-${e.id}`,
      kind: "escalation" as const,
      title: `Negative comment on ${e.platform} — no response yet`,
      detail: e.snippet,
      href: "/insights/audience#community",
      actionLabel: "Respond",
      createdAt: e.createdAt,
    })),
  ];

  return items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
