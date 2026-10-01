import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOpsViewer } from "@/lib/current-viewer";

export default async function OpsDeliveryIndexPage() {
  const viewer = await getOpsViewer();

  const project =
    (await prisma.project.findFirst({
      where: {
        client: { accountLeadId: viewer.id, status: "ACTIVE" },
        status: { notIn: ["ARCHIVED", "DELIVERED"] },
        dueDate: { not: null },
      },
      orderBy: { dueDate: "asc" },
    })) ??
    (await prisma.project.findFirst({
      where: { client: { accountLeadId: viewer.id, status: "ACTIVE" }, status: { notIn: ["ARCHIVED", "DELIVERED"] } },
      orderBy: { createdAt: "desc" },
    })) ??
    (await prisma.project.findFirst({
      where: { status: { notIn: ["ARCHIVED", "DELIVERED"] }, dueDate: { not: null } },
      orderBy: { dueDate: "asc" },
    }));

  if (!project) redirect("/ops");
  redirect(`/ops/clients/${project.clientId}/delivery`);
}
