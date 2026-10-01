import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export async function getClientWorkspace(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      brandOS: true,
      accountLead: { include: { user: true } },
      touchpoints: { include: { withClientUser: { include: { user: true } } }, orderBy: { scheduledAt: "asc" } },
    },
  });
  if (!client) notFound();

  const activeProject = await prisma.project.findFirst({
    where: { clientId, status: { notIn: ["ARCHIVED", "DELIVERED"] } },
    orderBy: { updatedAt: "desc" },
    include: {
      team: { include: { members: { include: { staffMember: { include: { user: true } } } } } },
      agentRuns: { include: { agent: true }, orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  return { client, activeProject };
}

export type ClientWorkspace = Awaited<ReturnType<typeof getClientWorkspace>>;
