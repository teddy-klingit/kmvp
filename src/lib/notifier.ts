import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

/**
 * The one way the app notifies someone. Every notification is written in-app; anything that leaves the app
 * (email, Slack: OUTGOING, empty until a transport is set up) is skipped for demo accounts, so a demo never
 * emails or messages a real person.
 */

type NotificationData = Prisma.NotificationUncheckedCreateInput;
type Transport = (n: NotificationData) => Promise<void>;

/** Outgoing channels (email, Slack). None is configured yet; each one plugs in here. */
const OUTGOING: Transport[] = [];

async function isDemoClient(clientId: string | null | undefined) {
  if (!clientId) return false;
  return Boolean((await prisma.client.findUnique({ where: { id: clientId }, select: { isDemo: true } }))?.isDemo);
}

export async function notify(data: NotificationData) {
  const row = await prisma.notification.create({ data });
  if (OUTGOING.length && !(await isDemoClient(data.clientId))) await Promise.all(OUTGOING.map((send) => send(data).catch(() => undefined)));
  return row;
}

export async function notifyMany(data: NotificationData[]) {
  for (const d of data) await notify(d);
}
