import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { setMockSession } from "./setup";
import { createContract } from "@/lib/contracts";
import { createRequest } from "@/lib/requests";
import { scopeFor } from "@/lib/staff-scope";
import { loadToday } from "@/lib/today";
import { loadInline } from "@/lib/today-inline";
import { loadClientRows } from "@/lib/client-rows";
import { clientOverview } from "@/lib/client-overview";
import { hasAdmin } from "@/lib/role-tier";
import ClientBillingPage from "@/app/ops/clients/[clientId]/(workspace)/billing/page";
import ClientSetupPage from "@/app/ops/clients/[clientId]/(workspace)/admin/page";
import { GET as exportInvoices } from "@/app/api/ops/invoices/export/route";
import { pauseAction } from "@/lib/actions/ops-contract-actions";

/**
 * Quick fixes: roles are separate and a Marketing PM never sees or handles money. Invoices, payment status and
 * prices stay with Admin, on the page, in what Today returns and on the server.
 */

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
let pm: { id: string; userId: string; title: "ACCOUNT_LEAD" };
const MONEY = /€|\bEUR\b|invoice|on the next invoice/i;

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const u = await prisma.user.create({ data: { name: "Pia PM", email: `pia-${Date.now()}@test.local`, role: "INTERNAL", status: "ACTIVE" } });
  // The old "admin on top of PM" flag, set on purpose: it must not give Admin any more.
  pm = { ...(await prisma.staffMember.create({ data: { userId: u.id, title: "ACCOUNT_LEAD", isAdmin: true } })), title: "ACCOUNT_LEAD" as const };
  await createContract({ clientId: fx.clientA.id, platformPlanKey: "enterprise", teamPackKey: "pmc20_40", termMonths: 12, startDate: new Date("2026-09-01T00:00:00"), currency: "EUR", contactStaffId: pm.id }, null);
  await prisma.invoice.create({ data: { clientId: fx.clientA.id, number: `INV-TEST-${Date.now()}`, amount: 5440, currency: "EUR", status: "OVERDUE", issuedAt: new Date("2026-09-01"), dueAt: new Date("2026-09-21"), lineItems: [] } });
  await createRequest(fx.clientA.id, fx.userA.id, "creative_pack", { packs: 1 });
});
afterAll(async () => {
  await prisma.invoice.deleteMany({ where: { clientId: fx.clientA.id } });
  await prisma.contract.deleteMany({ where: { clientId: fx.clientA.id } });
  await fx.cleanup();
  await prisma.staffMember.deleteMany({ where: { id: pm.id } });
  await prisma.user.deleteMany({ where: { id: pm.userId } });
});

describe("a Marketing PM never sees money", () => {
  it("roles are separate: a PM is never an admin, even with the old flag set", () => {
    expect(hasAdmin(pm)).toBe(false);
  });

  it("Today has no invoice rows and no prices; a credit request shows the credit change instead", async () => {
    const today = await loadToday(await scopeFor(pm), new Date(), { id: pm.id });
    expect(today.tasks.some((t) => t.kind === "INVOICE")).toBe(false);
    const request = today.tasks.find((t) => t.kind === "REQUEST" && t.clientId === fx.clientA.id)!;
    expect(request).toBeTruthy();
    for (const t of today.tasks) expect(`${t.sentence} ${t.context}`).not.toMatch(MONEY);
    for (const k of today.keepAnEye) expect(`${k.line} ${k.note ?? ""}`).not.toMatch(MONEY);
    // What the server sends the browser for the row: the new balance, never a price.
    const inline = (await loadInline([request]))[request.key];
    expect(inline).toMatchObject({ kind: "REQUEST", balance: { after: expect.any(Number) } });
    expect(JSON.stringify(inline)).not.toMatch(/price|5440|EUR/);
  });

  it("the Clients list and the client's Overview have no invoice flag, no prices and no next invoice", async () => {
    const rows = await loadClientRows(await scopeFor(pm));
    expect(rows.find((r) => r.id === fx.clientA.id)!.overdueInvoices).toBe(0);
    expect(rows.flatMap((r) => r.attention).join(" ")).not.toMatch(/invoice/i);
    const o = await clientOverview(fx.clientA.id, [], new Date());
    expect(o.contract).toMatchObject({ perMonth: null, nextInvoice: null, pack: "PM 20 · creative 40 a month" });
    expect([...o.health.warnings, ...o.health.ticks].join(" ")).not.toMatch(/invoice/i);
  });

  it("the server refuses a PM the client's Billing and Setup, the invoice export and contract changes", async () => {
    setMockSession({ user: { id: pm.userId, role: "INTERNAL" } });
    const params = Promise.resolve({ clientId: fx.clientA.id });
    await expect(ClientBillingPage({ params })).rejects.toThrow(/REDIRECT:\/ops/);
    await expect(ClientSetupPage({ params })).rejects.toThrow(/REDIRECT:\/ops/);
    expect((await exportInvoices(new Request("http://x/api/ops/invoices/export"))).status).toBe(404);
    const fd = new FormData();
    fd.set("clientId", fx.clientA.id);
    await expect(pauseAction(fd)).rejects.toThrow();
  });
});

describe("billing still works for Admin", () => {
  it("an admin sees the overdue invoice, the prices and the next invoice, and opens Billing", async () => {
    const o = await clientOverview(fx.clientA.id, [], new Date(), { money: true });
    expect(o.contract?.perMonth).toMatch(/€/);
    expect(o.contract?.nextInvoice).toBeTruthy();
    expect(o.health.warnings.join(" ")).toMatch(/invoice is overdue/);
    setMockSession({ user: { id: fx.adminUser.id, role: "INTERNAL" } });
    await expect(ClientBillingPage({ params: Promise.resolve({ clientId: fx.clientA.id }) })).resolves.toBeTruthy();
  });
});
