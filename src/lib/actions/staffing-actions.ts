"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOpsRole, requireTeamMemberInClient } from "@/lib/authz";

export async function assignStaffToTeamAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  const staffMemberId = String(formData.get("staffMemberId") ?? "");
  const roleOnProject = String(formData.get("roleOnProject") ?? "").trim();
  const allocatedHours = Number(formData.get("allocatedHours") ?? 0);
  const recommended = formData.get("recommended") === "true";
  if (!projectId || !staffMemberId || !roleOnProject) return;

  const project = await prisma.project.findFirst({ where: { id: projectId, clientId } });
  if (!project) return;

  const team = await prisma.team.upsert({
    where: { projectId },
    update: {},
    create: { projectId, proposedByStaffId: viewer.id },
  });

  await prisma.teamMember.upsert({
    where: { teamId_staffMemberId: { teamId: team.id, staffMemberId } },
    update: { roleOnProject, allocatedHours, recommended },
    create: { teamId: team.id, staffMemberId, roleOnProject, allocatedHours, recommended },
  });

  revalidatePath(`/ops/clients/${clientId}`, "layout");
}

export async function removeTeamMemberAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);
  const teamMemberId = String(formData.get("teamMemberId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");

  const member = await requireTeamMemberInClient(teamMemberId, clientId);
  if (!member || member.team.confirmed) return;

  await prisma.teamMember.delete({ where: { id: teamMemberId } });
  revalidatePath(`/ops/clients/${clientId}`, "layout");
}
