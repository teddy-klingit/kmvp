"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOpsRole } from "@/lib/authz";

function linesToArray(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export async function updateBrandOSAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);
  const clientId = String(formData.get("clientId") ?? "");

  await prisma.brandOS.upsert({
    where: { clientId },
    update: {
      toneRules: linesToArray(String(formData.get("toneRules") ?? "")),
      dos: linesToArray(String(formData.get("dos") ?? "")),
      donts: linesToArray(String(formData.get("donts") ?? "")),
      approvedColors: linesToArray(String(formData.get("approvedColors") ?? "")),
      approvedTypography: linesToArray(String(formData.get("approvedTypography") ?? "")),
      lastSyncedAt: new Date(),
    },
    create: {
      clientId,
      toneRules: linesToArray(String(formData.get("toneRules") ?? "")),
      dos: linesToArray(String(formData.get("dos") ?? "")),
      donts: linesToArray(String(formData.get("donts") ?? "")),
      approvedColors: linesToArray(String(formData.get("approvedColors") ?? "")),
      approvedTypography: linesToArray(String(formData.get("approvedTypography") ?? "")),
    },
  });

  revalidatePath(`/ops/clients/${clientId}/brand-os`);
}
