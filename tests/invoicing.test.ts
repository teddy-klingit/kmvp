import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { createContract } from "@/lib/contracts";
import { billingProfile, exportInvoicesCsv, generateDueInvoices, invoicePeriods, markInvoicePaid, refreshOverdue, sendInvoice, vatFor } from "@/lib/invoicing";
import { createRequest, decideRequest, quoteRequest } from "@/lib/requests";
import { poolBalance, slotsForContract } from "@/lib/team-ledger";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const d = (s: string) => new Date(`${s}T00:00:00`);

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const u = await prisma.user.create({ data: { name: "Ivo Invoice", email: `inv-${Date.now()}@test.local`, role: "INTERNAL", status: "ACTIVE" } });
  const pm = await prisma.staffMember.create({ data: { userId: u.id, title: "ACCOUNT_LEAD" } });
  await createContract({ clientId: fx.clientA.id, platformPlanKey: "enterprise", teamPackKey: "pmc20_40", termMonths: 12, startDate: d("2026-09-01"), currency: "EUR", contactStaffId: pm.id }, null);
  await createContract({ clientId: fx.clientB.id, platformPlanKey: "pro", termMonths: 3, startDate: d("2026-09-01"), currency: "NOK" }, null);
});
afterAll(async () => {
  await prisma.invoice.deleteMany({ where: { clientId: { in: [fx.clientA.id, fx.clientB.id] } } });
  await prisma.contract.deleteMany({ where: { clientId: { in: [fx.clientA.id, fx.clientB.id] } } });
  await fx.cleanup();
});

describe("invoicing: by invoice, from the contract's schedule", () => {
  it("periods follow the invoicing: quarterly, monthly or upfront", () => {
    const base = { startDate: d("2026-09-01"), endDate: d("2027-09-01"), termMonths: 12 };
    // Quarterly follows calendar quarters: September, Q4, Q1, Q2, then July–August.
    expect(invoicePeriods({ ...base, invoicing: "quarterly" }).map((p) => p.months)).toEqual([1, 3, 3, 3, 2]);
    expect(invoicePeriods({ ...base, startDate: d("2026-10-01"), endDate: d("2027-10-01"), invoicing: "quarterly" }).map((p) => p.months)).toEqual([3, 3, 3, 3]);
    expect(invoicePeriods({ ...base, invoicing: "monthly" })).toHaveLength(12);
    expect(invoicePeriods({ ...base, invoicing: "upfront" }).map((p) => p.months)).toEqual([12]);
  });

  it("writes one draft per started period with the platform and team lines, net + VAT = total, numbered in sequence", async () => {
    const made = await generateDueInvoices(d("2026-09-02"), [fx.clientA.id]);
    expect(made).toHaveLength(1);
    const inv = await prisma.invoice.findFirstOrThrow({ where: { clientId: fx.clientA.id } });
    expect((inv.lineItems as { kind: string; amount: number }[]).map((l) => [l.kind, l.amount])).toEqual([
      ["platform", 249],
      ["team", 4600],
    ]); // September only: the next invoice is Q4
    expect([inv.status, inv.netAmount, inv.vatRate, inv.vatAmount, inv.amount, inv.currency]).toEqual(["DRAFT", 4849, 0.25, 1212.25, 6061.25, "EUR"]);
    expect(inv.number).toMatch(/^KL-2026-\d{4}$/);
    expect(await generateDueInvoices(d("2026-09-20"), [fx.clientA.id])).toEqual([]); // once per period
  });

  it("a request shows its price and rule; approving applies it and bills it on the next invoice; declining changes nothing", async () => {
    const q = await quoteRequest(fx.clientA.id, "creative_pack", { packs: 1 });
    expect(q).toMatchObject({ price: Math.round((4600 / 60) * 1.1 * 10), credits: 10, currency: "EUR" });
    const before = await poolBalance(fx.clientA.id, "creative");
    const declined = await createRequest(fx.clientA.id, fx.userA.id, "creative_pack", { packs: 1 });
    await decideRequest(declined.id, null, false, "Not this month");
    expect(await poolBalance(fx.clientA.id, "creative")).toBe(before);
    const req = await createRequest(fx.clientA.id, fx.userA.id, "creative_pack", { packs: 1 });
    expect(req.status).toBe("pending");
    await decideRequest(req.id, fx.adminUser.id, true, null, d("2026-10-10"));
    expect(await poolBalance(fx.clientA.id, "creative")).toBe(before + 10);
    const slot = await createRequest(fx.clientA.id, fx.userA.id, "extra_slot", {});
    expect(slot.price).toBe(460); // 10% of 4,600 a month
    await decideRequest(slot.id, fx.adminUser.id, true, null);
    const c = await prisma.contract.findFirstOrThrow({ where: { clientId: fx.clientA.id } });
    expect(await slotsForContract(c)).toBe(5);
    await generateDueInvoices(d("2026-12-02"), [fx.clientA.id]);
    const dec = await prisma.invoice.findFirstOrThrow({ where: { clientId: fx.clientA.id, periodStart: d("2026-10-01") } }); // Q4
    const kinds = (dec.lineItems as { kind: string; amount: number }[]).map((l) => [l.kind, l.amount]);
    expect(kinds).toContainEqual(["creative_pack", 843]);
    expect(kinds).toContainEqual(["extra_slot", 1380]);
    expect(kinds.filter(([k]) => k === "creative_pack")).toHaveLength(1); // billed once
  });

  it("AI top-ups under the client's limit are approved without staff", async () => {
    await billingProfile(fx.clientB.id);
    await prisma.billingProfile.update({ where: { clientId: fx.clientB.id }, data: { aiTopUpAutoApproveUpTo: 1000 } });
    const r = await createRequest(fx.clientB.id, fx.userB.id, "ai_topup", { count: 1 });
    expect(r.status).toBe("approved");
    expect(await prisma.aiCreditLedger.count({ where: { clientId: fx.clientB.id, kind: "BUNDLE", amount: 1000 } })).toBe(1);
    expect(r.currency).toBe("NOK");
  });

  it("sent invoices get a due date, go overdue after it, and can be marked paid; the CSV is the accounting hand-off", async () => {
    const inv = await prisma.invoice.findFirstOrThrow({ where: { clientId: fx.clientA.id, periodStart: d("2026-09-01") } });
    await prisma.billingProfile.update({ where: { clientId: fx.clientA.id }, data: { orgNumber: "556000-0001" } });
    const sent = await sendInvoice(inv.id, null, d("2026-09-02"));
    expect(Math.round((sent.dueAt!.getTime() - d("2026-09-02").getTime()) / 86400000)).toBe(30);
    await refreshOverdue(d("2026-10-05"));
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("OVERDUE");
    await markInvoicePaid(inv.id, null);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("PAID");
    const csv = await exportInvoicesCsv(d("2026-09-01"), d("2026-10-01"));
    expect(csv.split("\n")[0]).toContain("org_number");
    expect(csv).toContain(`${inv.number},`);
    expect(csv).toContain("556000-0001");
  });

  it("VAT: Sweden 25%, abroad reverse charge", async () => {
    expect(await vatFor("SE")).toBe(0.25);
    expect(await vatFor("no")).toBe(0);
  });

  it("no card payment anywhere in the client app", () => {
    const files: string[] = [];
    const walk = (dir: string) => readdirSync(dir).forEach((f) => (statSync(path.join(dir, f)).isDirectory() ? walk(path.join(dir, f)) : /\.tsx?$/.test(f) && files.push(path.join(dir, f))));
    walk(path.join(__dirname, "../src/app/(portal)"));
    walk(path.join(__dirname, "../src/components/portal"));
    const hits = files.filter((f) => /cardLast4|cardBrand|card on file|payment method/i.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
