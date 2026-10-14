"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOpsRole } from "@/lib/authz";
import { cancelContract, ContractError, createContract, endContract, pauseContract, resumeContract, scheduleDowngrade, scheduleUpgrade, setContact, type Invoicing } from "@/lib/contracts";

/**
 * Staff: a client's contract (Phase S step 4). Admins and PMs create, amend, pause, end and change the contact
 * person. Every change is logged (ContractChange + AuditLog). Errors come back on the page as ?error=.
 */

const back = (clientId: string, msg?: { ok?: string; error?: string }) => {
  revalidatePath(`/ops/clients/${clientId}`, "layout");
  revalidatePath("/settings/plan");
  const q = new URLSearchParams(Object.entries(msg ?? {}).filter((e): e is [string, string] => Boolean(e[1])));
  redirect(`/ops/clients/${clientId}/contract${q.size ? `?${q}` : ""}`);
};

async function run(formData: FormData, fn: (viewer: Awaited<ReturnType<typeof requireOpsRole>>, clientId: string, contractId: string) => Promise<string>) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const clientId = String(formData.get("clientId") ?? "");
  const contractId = String(formData.get("contractId") ?? "");
  let ok: string;
  try {
    ok = await fn(viewer, clientId, contractId);
  } catch (e) {
    if (e instanceof ContractError) back(clientId, { error: e.message });
    throw e;
  }
  back(clientId, { ok });
}

const num = (v: FormDataEntryValue | null) => (String(v ?? "").trim() === "" ? null : Number(String(v).replace(",", ".")));
const custom = (f: FormData) => (f.get("teamPackKey") === "per_request" ? { pmCredits: num(f.get("customPm")) ?? 0, creativeCredits: num(f.get("customCreative")) ?? 0, teamEur: num(f.get("customTeamEur")) ?? 0 } : null);

export async function createContractAction(formData: FormData) {
  await run(formData, async (viewer, clientId) => {
    const start = String(formData.get("startDate") ?? "");
    await createContract(
      {
        clientId,
        platformPlanKey: String(formData.get("platformPlanKey") ?? ""),
        teamPackKey: String(formData.get("teamPackKey") ?? "") || null,
        custom: custom(formData),
        termMonths: Number(formData.get("termMonths") ?? 12),
        startDate: /^\d{4}-\d{2}-\d{2}$/.test(start) ? new Date(`${start}T00:00:00`) : new Date(),
        invoicing: (String(formData.get("invoicing") ?? "") || undefined) as Invoicing | undefined,
        currency: String(formData.get("currency") ?? "EUR"),
        contactStaffId: String(formData.get("contactStaffId") ?? "") || null,
      },
      viewer.userId
    );
    return "Contract created.";
  });
}

export async function setContactAction(formData: FormData) {
  await run(formData, async (viewer, _clientId, contractId) => {
    await setContact(contractId, String(formData.get("contactStaffId") ?? "") || null, viewer.userId);
    return "Contact person changed. The client was told.";
  });
}

export async function upgradeAction(formData: FormData) {
  await run(formData, async (viewer, _clientId, contractId) => {
    const ch = await scheduleUpgrade(contractId, { teamPackKey: String(formData.get("teamPackKey") ?? ""), months: Number(formData.get("months") ?? 3), custom: custom(formData) }, viewer.userId);
    return `Upgrade scheduled from ${ch.effectiveFrom.toLocaleDateString("en-GB")}.`;
  });
}

export async function downgradeAction(formData: FormData) {
  await run(formData, async (viewer, _clientId, contractId) => {
    const ch = await scheduleDowngrade(contractId, { teamPackKey: String(formData.get("teamPackKey") ?? "") || null, custom: custom(formData) }, viewer.userId);
    return `Downgrade scheduled from ${ch.effectiveFrom.toLocaleDateString("en-GB")}.`;
  });
}

export async function pauseAction(formData: FormData) {
  await run(formData, async (viewer, _clientId, contractId) => {
    await pauseContract(contractId, viewer.userId, String(formData.get("note") ?? "") || null);
    return "Paused: the platform stays, new projects stop.";
  });
}

export async function resumeAction(formData: FormData) {
  await run(formData, async (viewer, _clientId, contractId) => {
    await resumeContract(contractId, viewer.userId);
    return "Restarted. The end date moved by the pause.";
  });
}

export async function cancelAction(formData: FormData) {
  await run(formData, async (viewer, _clientId, contractId) => {
    await cancelContract(contractId, viewer.userId);
    return "Cancelled: it ends on its end date instead of renewing.";
  });
}

export async function endAction(formData: FormData) {
  await run(formData, async (viewer, _clientId, contractId) => {
    await endContract(contractId, viewer.userId, String(formData.get("note") ?? "") || null);
    return "Contract ended.";
  });
}
