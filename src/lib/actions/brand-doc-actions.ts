"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";

type EmptyState = Record<string, never>;
const EMPTY: EmptyState = {};

const TEXT_FIELD_FOR: Record<string, "vision" | "mission" | "competitiveNote" | "servicesNote"> = {
  vision: "vision",
  mission: "mission",
  "market-position": "competitiveNote",
  "services-products": "servicesNote",
};

function revalidateDoc(doc: string) {
  revalidatePath(`/assets/brand-platform/${doc}`);
  revalidatePath("/assets/brand-platform");
  revalidatePath("/assets");
}

export async function updateBrandTextDocAction(_prev: EmptyState, formData: FormData): Promise<EmptyState> {
  const viewer = await getPortalViewer();
  const doc = String(formData.get("doc") ?? "");
  const value = String(formData.get("value") ?? "").trim();

  if (doc === "our-brand") {
    await prisma.client.update({ where: { id: viewer.clientId }, data: { brandSummary: value || null } });
  } else if (TEXT_FIELD_FOR[doc]) {
    await prisma.brandOS.update({
      where: { clientId: viewer.clientId },
      data: { [TEXT_FIELD_FOR[doc]]: value || null },
    });
  } else {
    return EMPTY;
  }

  revalidateDoc(doc);
  return EMPTY;
}

export async function updateUspsAction(_prev: EmptyState, formData: FormData): Promise<EmptyState> {
  const viewer = await getPortalViewer();
  const raw = String(formData.get("value") ?? "");
  const usps = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  await prisma.brandOS.update({ where: { clientId: viewer.clientId }, data: { usps } });
  revalidateDoc("usps");
  return EMPTY;
}

export async function updatePersonasAction(_prev: EmptyState, formData: FormData): Promise<EmptyState> {
  const viewer = await getPortalViewer();
  const raw = String(formData.get("value") ?? "");
  const audiencePersonas = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ageRange, description, traits] = line.split("|").map((s) => s.trim());
      return {
        name: name ?? "",
        ageRange: ageRange ?? "",
        description: description ?? "",
        traits: (traits ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      };
    });

  await prisma.brandOS.update({ where: { clientId: viewer.clientId }, data: { audiencePersonas } });
  revalidateDoc("target-audience");
  return EMPTY;
}

export async function updateCoreValuesAction(_prev: EmptyState, formData: FormData): Promise<EmptyState> {
  const viewer = await getPortalViewer();
  const raw = String(formData.get("value") ?? "");
  const coreValues = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, ...rest] = line.split("|");
      return { title: title.trim(), description: rest.join("|").trim() };
    });

  await prisma.brandOS.update({ where: { clientId: viewer.clientId }, data: { coreValues } });
  revalidateDoc("core-values");
  return EMPTY;
}
