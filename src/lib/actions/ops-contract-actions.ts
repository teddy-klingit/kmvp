"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOpsRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { poolBalance } from "@/lib/team-ledger";
import { cancelContract, ContractError, createContract, endContract, pauseContract, resumeContract, scheduleDowngrade, scheduleUpgrade, setContact, type Invoicing } from "@/lib/contracts";

/**
 * Staff: a client's contract (Phase S step 4). Admins and PMs create, amend, pause, end and change the contact
 * person. Every change is logged (ContractChange + AuditLog). Errors come back on the page as ?error=.
 */

const back = (clientId: string, msg?: { ok?: string; error?: string }, tab = "contract") => {
  revalidatePath(`/ops/clients/${clientId}`, "layout");
  revalidatePath("/settings/plan");
  const q = new URLSearchParams(Object.entries(msg ?? {}).filter((e): e is [string, string] => Boolean(e[1])));
  redirect(`/ops/clients/${clientId}/${tab === "balances" ? "balances" : "contract"}${q.size ? `?${q}` : ""}`);
};

async function run(formData: FormData, fn: (viewer: Awaited<ReturnType<typeof requireOpsRole>>, clientId: string, contractId: string) => Promise<string>) {
  const viewer = await requireOpsRole(["ADMIN"]);
  const clientId = String(formData.get("clientId") ?? "");
  const contractId = String(formData.get("contractId") ?? "");
  let ok: string;
  try {
    ok = await fn(viewer, clientId, contractId);
  } catch (e) {
    if (e instanceof ContractError) back(clientId, { error: e.message }, String(formData.get("back") ?? ""));
    throw e;
  }
  back(clientId, { ok }, String(formData.get("back") ?? ""));
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

/** A manual adjustment to the PM or creative balance, with a reason (ledger + AuditLog). */
export async function adjustBalanceAction(formData: FormData) {
  await run(formData, async (viewer, clientId) => {
    const pool = formData.get("pool") === "pm" ? "pm" : "creative";
    const amount = Number(String(formData.get("amount") ?? "").replace(",", "."));
    const reason = String(formData.get("reason") ?? "").trim();
    if (!Number.isFinite(amount) || amount === 0) throw new ContractError("Give an amount (negative to take credits away).");
    if (!reason) throw new ContractError("Say why: the reason is logged.");
    const before = await poolBalance(clientId, pool);
    await prisma.creditLedgerEntry.create({ data: { clientId, pool, type: "ADJUSTMENT", amount, balanceAfter: before + amount, note: reason, userId: viewer.userId } });
    await prisma.auditLog.create({ data: { clientId, actorUserId: viewer.userId, area: "balance", action: `${pool} ${amount > 0 ? "+" : ""}${amount}: ${reason}`, before: { balance: before }, after: { balance: before + amount } } });
    return "Balance adjusted.";
  });
}

/** A fixed-credit monthly service (Performance via Druce, the web retainer…), reserved from creative each month. */
export async function addServiceAction(formData: FormData) {
  await run(formData, async (viewer, clientId) => {
    const item = await prisma.priceListItem.findUnique({ where: { id: String(formData.get("priceListItemId") ?? "") } });
    if (!item || !item.monthly) throw new ContractError("Pick a monthly service from the Price List.");
    const months = Number(formData.get("months") ?? 0);
    if (![3, 6, 12].includes(months)) throw new ContractError("A service runs 3, 6 or 12 months.");
    const start = String(formData.get("startDate") ?? "");
    const s = await prisma.serviceAllocation.create({
      data: { clientId, priceListItemId: item.id, name: item.displayName ?? item.deliverableType, creditsPerMonth: Number(formData.get("credits") ?? item.creditCost ?? 0) || (item.creditCost ?? 0), startDate: /^\d{4}-\d{2}-\d{2}$/.test(start) ? new Date(`${start}T00:00:00`) : new Date(), months, outsidePack: formData.get("outsidePack") === "on", createdByUserId: viewer.userId },
    });
    await prisma.auditLog.create({ data: { clientId, actorUserId: viewer.userId, area: "balance", action: `service ${s.name} · ${s.creditsPerMonth}/month for ${months} months${s.outsidePack ? " (outside the pack)" : ""}` } });
    return `${s.name} added: ${s.creditsPerMonth} credits a month for ${months} months.`;
  });
}

export async function endServiceAction(formData: FormData) {
  await run(formData, async (viewer, clientId) => {
    const s = await prisma.serviceAllocation.findFirst({ where: { id: String(formData.get("serviceId") ?? ""), clientId } });
    if (!s) throw new ContractError("Service not found.");
    await prisma.serviceAllocation.update({ where: { id: s.id }, data: { endedAt: new Date() } });
    await prisma.auditLog.create({ data: { clientId, actorUserId: viewer.userId, area: "balance", action: `service ${s.name} ended` } });
    return `${s.name} ended.`;
  });
}
