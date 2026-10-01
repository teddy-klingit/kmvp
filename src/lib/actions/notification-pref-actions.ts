"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function updateNotificationPrefsAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) return;

  await prisma.notificationPreference.upsert({
    where: { userId: session.user.id },
    update: {
      emailEnabled: formData.get("emailEnabled") === "on",
      inAppEnabled: formData.get("inAppEnabled") === "on",
      slackEnabled: formData.get("slackEnabled") === "on",
      frequency: String(formData.get("frequency") ?? "INSTANT"),
    },
    create: {
      userId: session.user.id,
      emailEnabled: formData.get("emailEnabled") === "on",
      inAppEnabled: formData.get("inAppEnabled") === "on",
      slackEnabled: formData.get("slackEnabled") === "on",
      frequency: String(formData.get("frequency") ?? "INSTANT"),
    },
  });

  revalidatePath("/account/security");
}

export async function connectSlackAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) return;
  const workspace = String(formData.get("slackWorkspace") ?? "").trim();
  if (!workspace) return;

  await prisma.notificationPreference.upsert({
    where: { userId: session.user.id },
    update: { slackEnabled: true, slackWorkspace: workspace },
    create: { userId: session.user.id, slackEnabled: true, slackWorkspace: workspace },
  });

  revalidatePath("/account/security");
}
