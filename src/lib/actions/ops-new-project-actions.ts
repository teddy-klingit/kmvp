"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOpsRole } from "@/lib/authz";
import { PIPELINE_STAGE_ORDER } from "@/lib/labels";

export async function createOpsProjectAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);

  const clientId = String(formData.get("clientId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "CAMPAIGN") as
    | "CAMPAIGN"
    | "SINGLE_ASSET"
    | "PRESENTATION"
    | "MOTION_VIDEO"
    | "DEVELOPMENT"
    | "BRAND_GUIDELINES"
    | "OTHER";
  const dueDate = String(formData.get("dueDate") ?? "");
  if (!clientId || !name) return;

  const project = await prisma.project.create({
    data: {
      clientId,
      name,
      type,
      status: "BRIEFING",
      dueDate: dueDate ? new Date(dueDate) : undefined,
    },
  });

  await prisma.pipelineStage.createMany({
    data: PIPELINE_STAGE_ORDER.map((stageName, order) => ({
      projectId: project.id,
      name: stageName,
      order,
      status: order === 0 ? "ACTIVE" : "UPCOMING",
    })),
  });

  await prisma.brief.create({ data: { projectId: project.id, status: "DRAFT" } });

  redirect(`/ops/projects/${project.id}#brief`);
}
