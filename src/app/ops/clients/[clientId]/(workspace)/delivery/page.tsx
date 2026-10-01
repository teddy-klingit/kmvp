import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { stageSlugForName } from "@/lib/pipeline-tabs";

export default async function DeliveryIndexPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;

  const project = await prisma.project.findFirst({
    where: { clientId, status: { notIn: ["ARCHIVED", "DELIVERED"] } },
    orderBy: { updatedAt: "desc" },
    include: { pipelineStages: true },
  });

  const activeStage = project?.pipelineStages.find((s) => s.status === "ACTIVE");
  const slug = activeStage ? stageSlugForName(activeStage.name) : "foundation";

  redirect(`/ops/clients/${clientId}/delivery/${slug}`);
}
