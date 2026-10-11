"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";

export async function saveBrandInfoAction(formData: FormData) {
  const viewer = await getPortalViewer();
  await prisma.client.update({
    where: { id: viewer.clientId },
    data: {
      name: String(formData.get("brandName") ?? viewer.client.name),
      industry: String(formData.get("industry") ?? ""),
    },
  });

  await prisma.brandOS.upsert({
    where: { clientId: viewer.clientId },
    update: {
      approvedColors: [String(formData.get("primaryColor") ?? "#2F5FE3")],
      approvedTypography: [String(formData.get("primaryFont") ?? "")],
    },
    create: {
      clientId: viewer.clientId,
      approvedColors: [String(formData.get("primaryColor") ?? "#2F5FE3")],
      approvedTypography: [String(formData.get("primaryFont") ?? "")],
    },
  });
  // Personality picked in onboarding: tone rules in Brand OS → Rules (the owner sets them up, so they're active).
  for (const [i, trait] of String(formData.get("personality") ?? "").split(",").map((t) => t.trim()).filter(Boolean).entries()) {
    const exists = await prisma.brandRule.findFirst({ where: { clientId: viewer.clientId, type: "TONE", text: trait, deletedAt: null } });
    if (!exists) await prisma.brandRule.create({ data: { clientId: viewer.clientId, type: "TONE", text: trait, source: "onboarding", sortOrder: i, createdByUserId: viewer.userId } });
  }

  revalidatePath("/onboarding");
}

export async function completeOnboardingAction(formData: FormData) {
  const viewer = await getPortalViewer();
  await prisma.client.update({ where: { id: viewer.clientId }, data: { onboardingCompletedAt: new Date(), status: "ACTIVE" } });
  revalidatePath("/dashboard");
  redirect(String(formData.get("redirectTo") ?? "/dashboard"));
}
