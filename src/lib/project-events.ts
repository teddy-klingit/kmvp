import { prisma } from "@/lib/prisma";

/**
 * A project event in the client's "With Klingit" thread, rendered as a
 * centred chip ("Estimate v1 sent · 1 Oct"). Keep bodies short and
 * client-readable — they are shown verbatim.
 */
export async function postProjectEvent(projectId: string, body: string) {
  await prisma.comment.create({ data: { projectId, body, kind: "SYSTEM" } });
}
