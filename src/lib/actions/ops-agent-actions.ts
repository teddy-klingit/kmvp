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
  revalidatePath(`/ops/skills/${agentId}`);
  revalidatePath("/ops/skills");
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
  revalidatePath("/ops/skills/audit");
}

/**
 * Skills page label (Phase R): how clients see a standard skill — hidden, Self-service (they run it, AI credits) or
 * Run by Klingit (they ask, team credits) — its goal group, ≈ team credits and staff-picked example outputs.
 */
export async function updateSkillLabelAction(formData: FormData) {
  await requireOpsRole(["ADMIN"]);
  const agentId = String(formData.get("agentId") ?? "");
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent || agent.clientId) return;
  const availability = String(formData.get("availability") ?? "");
  const goal = String(formData.get("goal") ?? "");
  const team = String(formData.get("teamCreditsEstimate") ?? "").trim();
  const examples = String(formData.get("examples") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((l) => {
      const [title, text] = l.split("|").map((x) => x.trim());
      return text ? { title, text } : { title };
    });
  const avail = ["self_service", "klingit_run"].includes(availability) ? availability : null;
  await prisma.agent.update({
    where: { id: agentId },
    data: {
      availability: avail,
      selfService: avail === "self_service",
      ...(avail && agent.kind !== "SKILL" ? { kind: "SKILL" as const } : {}),
      goal: ["make_ad", "write_copy", "plan_brief"].includes(goal) ? goal : agent.goal,
      teamCreditsEstimate: team === "" ? null : Math.max(0, Number(team) || 0),
      examples,
    },
  });
  revalidatePath(`/ops/skills/${agentId}`);
  revalidatePath("/ops/skills");
  revalidatePath("/skills");
}
