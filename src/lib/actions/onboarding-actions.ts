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
      toneRules: String(formData.get("personality") ?? "").split(",").filter(Boolean),
    },
    create: {
      clientId: viewer.clientId,
      approvedColors: [String(formData.get("primaryColor") ?? "#2F5FE3")],
      approvedTypography: [String(formData.get("primaryFont") ?? "")],
      toneRules: String(formData.get("personality") ?? "").split(",").filter(Boolean),
    },
  });

  revalidatePath("/onboarding");
}

export async function completeOnboardingAction(formData: FormData) {
  const viewer = await getPortalViewer();
  await prisma.client.update({ where: { id: viewer.clientId }, data: { onboardingCompletedAt: new Date(), status: "ACTIVE" } });
  revalidatePath("/dashboard");
  redirect(String(formData.get("redirectTo") ?? "/dashboard"));
}
