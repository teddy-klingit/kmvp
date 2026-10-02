"use server";

import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireOpsRole } from "@/lib/authz";

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createClientAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);

  const name = String(formData.get("name") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim();
  const planTier = String(formData.get("planTier") ?? "GROWTH") as "STARTER" | "GROWTH" | "SCALE" | "ENTERPRISE";
  const accountLeadId = String(formData.get("accountLeadId") ?? "") || null;
  const contactName = String(formData.get("contactName") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim();
  if (!name) return;

  const allowance = { STARTER: 16, GROWTH: 40, SCALE: 80, ENTERPRISE: 160 }[planTier] ?? 40;

  let slug = slugify(name);
  const existing = await prisma.client.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${Date.now().toString(36)}`;

  const client = await prisma.client.create({
    data: {
      name,
      slug,
      industry: industry || null,
      planTier,
      status: "ONBOARDING",
      monthlyCreditAllowance: allowance,
      creditBalance: allowance,
      accountLeadId,
    },
  });

  await prisma.brandOS.create({ data: { clientId: client.id } });

  if (contactName && contactEmail && !(await prisma.user.findUnique({ where: { email: contactEmail } }))) {
    const user = await prisma.user.create({
      data: { name: contactName, email: contactEmail, role: "CLIENT", status: "INVITED" },
    });
    await prisma.clientUser.create({
      data: { userId: user.id, clientId: client.id, permission: "OWNER" },
    });
    const token = randomBytes(24).toString("hex");
    await prisma.verificationToken.create({
      data: { identifier: contactEmail, token, expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) },
    });
  }

  redirect(`/ops/clients/${client.id}/admin`);
}
