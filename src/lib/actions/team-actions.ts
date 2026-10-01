"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";

export type InviteState = { error?: string; success?: string; inviteLink?: string };

const inviteSchema = z.object({
  name: z.string().min(1, "Name is required."),
  email: z.string().email("Enter a valid email."),
  permission: z.enum(["OWNER", "APPROVER", "VIEWER"]),
});

export async function inviteClientTeammateAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const viewer = await getPortalViewer();
  if (viewer.permission !== "OWNER") return { error: "Only an account owner can invite teammates." };

  const parsed = inviteSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    permission: formData.get("permission"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { error: "That email is already on Klingit." };

  const user = await prisma.user.create({
    data: { name: parsed.data.name, email: parsed.data.email, role: "CLIENT", status: "INVITED" },
  });
  await prisma.clientUser.create({
    data: { userId: user.id, clientId: viewer.clientId, permission: parsed.data.permission },
  });

  const token = randomBytes(24).toString("hex");
  await prisma.verificationToken.create({
    data: { identifier: user.email, token, expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) },
  });

  revalidatePath("/account/team");
  return {
    success: `Invited ${parsed.data.name}.`,
    inviteLink: `/invite?token=${token}&email=${encodeURIComponent(user.email)}`,
  };
}

export async function updateTeammatePermissionAction(formData: FormData) {
  const viewer = await getPortalViewer();
  if (viewer.permission !== "OWNER") return;

  const clientUserId = String(formData.get("clientUserId") ?? "");
  const permission = String(formData.get("permission") ?? "VIEWER") as "OWNER" | "APPROVER" | "VIEWER";

  const target = await prisma.clientUser.findFirst({ where: { id: clientUserId, clientId: viewer.clientId } });
  if (!target) return;

  await prisma.clientUser.update({ where: { id: clientUserId }, data: { permission } });
  revalidatePath("/account/team");
}

export async function removeTeammateAction(formData: FormData) {
  const viewer = await getPortalViewer();
  if (viewer.permission !== "OWNER") return;

  const clientUserId = String(formData.get("clientUserId") ?? "");
  const target = await prisma.clientUser.findFirst({ where: { id: clientUserId, clientId: viewer.clientId } });
  if (!target || target.id === viewer.id) return;

  await prisma.user.delete({ where: { id: target.userId } });
  revalidatePath("/account/team");
}
