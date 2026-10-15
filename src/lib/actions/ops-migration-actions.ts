"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOpsRole } from "@/lib/authz";
import { applyMigration } from "@/lib/migration";

/** Admins: move one client to its proposed contract (Phase S, S8). One client per click; logged in applyMigration. */
export async function applyMigrationAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  const clientId = String(formData.get("clientId") ?? "");
  let msg: string;
  try {
    const r = await applyMigration(clientId, { useOverride: formData.get("credits") !== "plan" }, viewer.userId);
    msg = `ok=${encodeURIComponent(`Moved to ${r.proposal.planName}${r.proposal.packName ? ` + ${r.proposal.packName}` : ""}. The email draft is below.`)}`;
  } catch (e) {
    msg = `error=${encodeURIComponent(e instanceof Error ? e.message : "Couldn't apply it.")}`;
  }
  revalidatePath("/ops/admin/migration");
  revalidatePath(`/ops/clients/${clientId}`, "layout");
  redirect(`/ops/admin/migration?${msg}`);
}
