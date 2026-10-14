"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOpsRole } from "@/lib/authz";

/** Staff edit Plan's lead times (working days and ≈ team credits per format) and key moments (Phase R). */

export async function saveLeadTimeAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);
  const id = String(formData.get("id") ?? "");
  const format = String(formData.get("format") ?? "").trim();
  const workingDays = Math.max(1, Math.round(Number(formData.get("workingDays") ?? 0)));
  const credits = String(formData.get("teamCredits") ?? "").trim();
  if (!format || !Number.isFinite(workingDays)) return;
  const data = { format, workingDays, teamCredits: credits === "" ? null : Math.max(0, Number(credits) || 0) };
  if (id) await prisma.planLeadTime.update({ where: { id }, data });
  else await prisma.planLeadTime.create({ data: { ...data, sortOrder: await prisma.planLeadTime.count() } });
  revalidatePath("/ops/settings");
  revalidatePath("/plan", "layout");
}

export async function saveKeyMomentAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);
  const name = String(formData.get("name") ?? "").trim();
  const day = String(formData.get("date") ?? "");
  const markets = formData.getAll("markets").map(String).filter((m) => ["SE", "NO", "DK", "FI"].includes(m));
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !markets.length) return;
  await prisma.keyMoment.create({ data: { name, date: new Date(`${day}T12:00:00Z`), markets, kind: formData.get("kind") === "shopping" ? "shopping" : "holiday" } });
  revalidatePath("/ops/settings");
  revalidatePath("/plan", "layout");
}

/** Key moments are reference data Klingit maintains (not client data): removing one deletes it. */
export async function removeKeyMomentAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);
  await prisma.keyMoment.deleteMany({ where: { id: String(formData.get("id") ?? "") } });
  revalidatePath("/ops/settings");
  revalidatePath("/plan", "layout");
}

