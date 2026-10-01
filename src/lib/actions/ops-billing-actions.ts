"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOpsRole } from "@/lib/authz";

export async function generateInvoiceAction(formData: FormData) {
  await requireOpsRole(["ADMIN"]);
  const projectId = String(formData.get("projectId") ?? "");

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || !project.priceAmount) return;

  const count = await prisma.invoice.count();
  await prisma.invoice.create({
    data: {
      clientId: project.clientId,
      projectId: project.id,
      number: `INV-2026-${String(1000 + count).padStart(4, "0")}`,
      amount: project.priceAmount,
      currency: project.priceCurrency,
      status: "SENT",
      issuedAt: new Date(),
      dueAt: new Date(Date.now() + 14 * 86400000),
      lineItems: [{ label: `${project.name} — full scope`, amount: project.priceAmount }],
    },
  });

  revalidatePath("/ops/billing");
}

export async function markInvoicePaidAction(formData: FormData) {
  await requireOpsRole(["ADMIN"]);
  const invoiceId = String(formData.get("invoiceId") ?? "");
  await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "PAID", paidAt: new Date() } });
  revalidatePath("/ops/billing");
}
