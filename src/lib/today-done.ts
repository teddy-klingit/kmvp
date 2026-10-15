import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/today";

/** Marks a Today task done for the staff member's day: "acted" (its action was done) or "ticked" off by hand. */
export async function markTaskDone(staffId: string, task: { key: string; label: string; clientId?: string | null }, how: "acted" | "ticked", now = new Date()) {
  const day = dayKey(now);
  await prisma.todayDone.upsert({
    where: { staffId_taskKey_day: { staffId, taskKey: task.key, day } },
    update: { how, label: task.label },
    create: { staffId, taskKey: task.key, day, how, label: task.label.slice(0, 200), clientId: task.clientId ?? null },
  });
}

export async function undoTaskDone(staffId: string, key: string, now = new Date()) {
  await prisma.todayDone.deleteMany({ where: { staffId, taskKey: key, day: dayKey(now), how: "ticked" } });
}
