"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { recheckSentVersions } from "@/lib/qc/brand-check";
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
    // Rules (tone, do's, words, claims) are edited in Brand OS → Rules (brand-rules.ts), not here.
    update: {
      approvedColors: linesToArray(String(formData.get("approvedColors") ?? "")),
      approvedTypography: linesToArray(String(formData.get("approvedTypography") ?? "")),
      lastSyncedAt: new Date(),
    },
    create: {
      clientId,
      approvedColors: linesToArray(String(formData.get("approvedColors") ?? "")),
      approvedTypography: linesToArray(String(formData.get("approvedTypography") ?? "")),
    },
  });

  revalidatePath(`/ops/clients/${clientId}/brand-os`);
  // Work the client already has is checked again against the new rules; anything that now fails goes to the PM.
  after(() => recheckSentVersions(clientId).catch(() => 0));
}
