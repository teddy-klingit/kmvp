import { prisma } from "@/lib/prisma";
import { planIcs } from "@/lib/plan";

/** A user's private plan feed (Plan → Subscribe). The token is the key; a revoked or unknown one is a 404. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const feed = await prisma.planFeedToken.findUnique({ where: { token } });
  if (!feed || feed.revokedAt) return new Response("Not found", { status: 404 });
  const member = await prisma.clientUser.findFirst({ where: { userId: feed.userId, clientId: feed.clientId } });
  if (!member) return new Response("Not found", { status: 404 });
  return new Response(await planIcs(feed.clientId, { id: member.id }), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=900" } });
}
