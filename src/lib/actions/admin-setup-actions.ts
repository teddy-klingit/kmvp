"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOpsRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { setContact } from "@/lib/contracts";
import { setLiveAdsInternal, setLiveAdsOwner, type LiveAdProvider } from "@/lib/integrations/live-ads-owner";
import { notify } from "@/lib/notifier";

/** Admin → To set up (Phase T): each job's inline action. Admins only; every change is logged. */

const back = (msg: { ok?: string; error?: string }, to = "/ops/admin") => {
  revalidatePath("/ops", "layout");
  const q = new URLSearchParams(Object.entries(msg).filter((e): e is [string, string] => Boolean(e[1])));
  redirect(`${to}${q.size ? `?${q}` : ""}`);
};

/** A client without a Marketing PM gets one: the contract's contact person if there's a contract, else the lead. */
export async function assignPmAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  const clientId = String(formData.get("clientId") ?? "");
  const staffId = String(formData.get("staffId") ?? "");
  const [client, staff] = await Promise.all([prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, accountLeadId: true } }), prisma.staffMember.findUnique({ where: { id: staffId }, include: { user: { select: { name: true } } } })]);
  if (!client || !staff) return back({ error: "Pick a PM first." });
  const contract = await prisma.contract.findFirst({ where: { clientId, status: { in: ["active", "paused", "ending", "scheduled"] } } });
  if (contract) await setContact(contract.id, staffId, viewer.userId);
  else {
    await prisma.client.update({ where: { id: clientId }, data: { accountLeadId: staffId } });
    await prisma.auditLog.create({ data: { clientId, actorUserId: viewer.userId, area: "contract", action: "Marketing PM assigned", before: { accountLeadId: client.accountLeadId }, after: { accountLeadId: staffId, name: staff.user.name } } });
  }
  back({ ok: `${staff.user.name} is now ${client.name}'s Marketing PM. Their tasks are on ${staff.user.name.split(" ")[0]}'s Today.` });
}

export async function adAccountAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  const provider = String(formData.get("provider") ?? "") as LiveAdProvider;
  const clientId = String(formData.get("clientId") ?? "");
  const r = formData.get("do") === "internal" ? await setLiveAdsInternal(provider, true, viewer.userId) : clientId ? await setLiveAdsOwner(provider, clientId, viewer.userId) : { error: "Pick a client first." };
  back(r.error ? { error: r.error } : { ok: formData.get("do") === "internal" ? "Marked as Klingit internal." : "Assigned." });
}

/** "Remind {PM}" about an overdue invoice on their client: in-app, and logged. */
export async function remindPmAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  const inv = await prisma.invoice.findUnique({ where: { id: String(formData.get("invoiceId") ?? "") }, include: { client: { select: { id: true, name: true, accountLead: { select: { userId: true, user: { select: { name: true } } } } } } } });
  if (!inv) return back({ error: "No such invoice." });
  const contract = await prisma.contract.findFirst({ where: { clientId: inv.clientId, status: { in: ["active", "paused", "ending"] } }, include: { contact: { select: { userId: true, user: { select: { name: true } } } } } });
  const pm = contract?.contact ?? inv.client.accountLead;
  if (!pm) return back({ error: `${inv.client.name} has no Marketing PM to remind.` });
  await notify({ userId: pm.userId, type: "SYSTEM", title: `${inv.client.name}: invoice ${inv.number} is overdue`, body: `${inv.amount.toLocaleString("en-GB")} ${inv.currency}. Can you check in with them?`, actionUrl: `/ops/admin/billing/invoices/${inv.id}`, actionLabel: "Open invoice" });
  await prisma.auditLog.create({ data: { clientId: inv.clientId, actorUserId: viewer.userId, area: "billing", action: `Reminded ${pm.user.name} about overdue invoice ${inv.number}` } });
  back({ ok: `Reminded ${pm.user.name.split(" ")[0]}.` });
}

/** "Add N items": drafts on the Price List with the credits left blank for an admin to set. */
export async function addDraftItemsAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  const names = formData.getAll("name").map(String).map((n) => n.trim()).filter(Boolean).slice(0, 20);
  if (!names.length) return back({ error: "Nothing to add." });
  const last = await prisma.priceListItem.aggregate({ _max: { sortOrder: true } });
  let order = (last._max.sortOrder ?? 0) + 1;
  for (const name of names) {
    const exists = await prisma.priceListItem.findFirst({ where: { archivedAt: null, OR: [{ deliverableType: name }, { displayName: name }] } });
    if (exists) continue;
    await prisma.priceListItem.create({ data: { deliverableType: name, displayName: name, category: "Drafts", unit: "per item", status: "draft", creditCost: null, visibleToClients: false, balance: "creative", sortOrder: order++ } });
  }
  await prisma.auditLog.create({ data: { clientId: null, actorUserId: viewer.userId, area: "pricing", action: `Added ${names.length} draft Price List item${names.length === 1 ? "" : "s"} from quotes`, after: { names } } });
  back({ ok: "Drafts added: set their credits and status." }, "/ops/admin/price-list?status=draft");
}
