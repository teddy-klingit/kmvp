"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOpsRole, requireClientApp } from "@/lib/authz";

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createClientAppAction(formData: FormData) {
  const staff = await requireOpsRole(["ADMIN", "PM"]);
  const clientId = String(formData.get("clientId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const hostedUrl = String(formData.get("hostedUrl") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!clientId || !name || !hostedUrl) return;

  await prisma.clientApp.create({
    data: {
      clientId,
      name,
      slug: slugify(name),
      hostedUrl,
      description: description || null,
      createdByStaffId: staff.id,
    },
  });

  revalidatePath(`/ops/clients/${clientId}/custom-apps`);
}

export async function updateClientAppAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);
  const clientId = String(formData.get("clientId") ?? "");
  const appId = String(formData.get("appId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const hostedUrl = String(formData.get("hostedUrl") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!appId || !name || !hostedUrl) return;

  const app = await requireClientApp(appId, clientId);
  if (!app) return;

  await prisma.clientApp.update({
    where: { id: appId },
    data: { name, hostedUrl, description: description || null },
  });

  revalidatePath(`/ops/clients/${clientId}/custom-apps`);
  revalidatePath(`/ops/clients/${clientId}/custom-apps/${appId}`);
  revalidatePath("/apps");
}

export async function archiveClientAppAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);
  const clientId = String(formData.get("clientId") ?? "");
  const appId = String(formData.get("appId") ?? "");

  const app = await requireClientApp(appId, clientId);
  if (!app) return;

  await prisma.clientApp.update({ where: { id: appId }, data: { status: "ARCHIVED" } });

  revalidatePath(`/ops/clients/${clientId}/custom-apps`);
  revalidatePath(`/ops/clients/${clientId}/custom-apps/${appId}`);
  revalidatePath("/apps");
}

export async function reactivateClientAppAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);
  const clientId = String(formData.get("clientId") ?? "");
  const appId = String(formData.get("appId") ?? "");

  const app = await requireClientApp(appId, clientId);
  if (!app) return;

  await prisma.clientApp.update({ where: { id: appId }, data: { status: "ACTIVE" } });

  revalidatePath(`/ops/clients/${clientId}/custom-apps`);
  revalidatePath(`/ops/clients/${clientId}/custom-apps/${appId}`);
  revalidatePath("/apps");
}
