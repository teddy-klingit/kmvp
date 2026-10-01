"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOpsRole } from "@/lib/authz";

export async function updateAgentStatusAction(formData: FormData) {
  await requireOpsRole(["ADMIN"]);
  const agentId = String(formData.get("agentId") ?? "");
  const status = String(formData.get("status") ?? "") as "LIVE" | "SANDBOX" | "DISABLED";
  if (!["LIVE", "SANDBOX", "DISABLED"].includes(status)) return;

  await prisma.agent.update({ where: { id: agentId }, data: { status } });
  revalidatePath(`/ops/agents/${agentId}`);
  revalidatePath("/ops/agents");
}

export async function updateAgentSelfServiceAction(formData: FormData) {
  await requireOpsRole(["ADMIN"]);
  const agentId = String(formData.get("agentId") ?? "");
  const selfService = formData.get("selfService") === "true";

  await prisma.agent.update({ where: { id: agentId }, data: { selfService } });
  revalidatePath(`/ops/agents/${agentId}`);
  revalidatePath("/ops/agents");
}

/** Admins and PMs may override (the form is only shown to them). Brief/estimate/staffing runs are overridden by editing in the cockpit. */
export async function overrideAgentRunAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const runId = String(formData.get("runId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return;

  await prisma.agentRun.update({
    where: { id: runId },
    data: { overridden: true, overriddenByUserId: viewer.userId, overrideReason: reason },
  });
  revalidatePath("/ops/agents/audit");
}
