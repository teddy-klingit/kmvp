"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOpsRole } from "@/lib/authz";
import { blockingFlags, loadQcSet, sendFlagToDesigner, sendToClient } from "@/lib/qc/quality-check";

/** Ops → Quality check (Phase S, S7.6): approve a project's checked outputs (through the QC gate) or send them back. */
export async function approveQcAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const r = await sendToClient(projectId, viewer.userId);
  revalidatePath("/ops/quality");
  revalidatePath(`/ops/projects/${projectId}`, "layout");
  redirect(`/ops/quality?${new URLSearchParams("error" in r ? { error: r.error ?? "Can't send yet." } : { ok: `Sent ${r.sent} to the client.` })}`);
}

export async function sendBackQcAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const set = await loadQcSet(projectId);
  let n = 0;
  for (const v of set)
    for (const f of blockingFlags(v).filter((f) => f.status === "OPEN")) {
      await sendFlagToDesigner(f.id, viewer.userId);
      n++;
    }
  revalidatePath("/ops/quality");
  redirect(`/ops/quality?${new URLSearchParams({ ok: n ? `${n} flag${n === 1 ? "" : "s"} sent back to the designer.` : "Nothing open to send back: open the check to comment." })}`);
}
