"use server";

import { revalidatePath } from "next/cache";
import { requireOpsRole } from "@/lib/authz";
import { OUHERS_CLIENT_ID, seedOuhers } from "@/lib/demo/ouhers";

export type ResetState = { error?: string; ok?: string };

/** "Reset demo" (ops, staff only): runs the ouhers seed again, which replaces only that demo client. */
export async function resetOuhersDemoAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  await requireOpsRole(["ADMIN", "PM"]);
  if (String(formData.get("clientId") ?? "") !== OUHERS_CLIENT_ID) return { error: "Only the ouhers demo can be reset." };
  try {
    const report = await seedOuhers();
    revalidatePath("/", "layout");
    const off = report.checks.filter((c) => !c.match).length;
    return { ok: `Demo reset. ${report.checks.length - off} of ${report.checks.length} computed values match the pack's notes.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The reset failed." };
  }
}
