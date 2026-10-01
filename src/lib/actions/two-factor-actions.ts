"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function toggleTwoFactorAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) return;

  const enable = String(formData.get("enable") ?? "true") === "true";
  await prisma.user.update({ where: { id: session.user.id }, data: { twoFactorEnabled: enable } });

  const path = String(formData.get("path") ?? "/account");
  revalidatePath(path);
}
