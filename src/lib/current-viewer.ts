import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getPortalViewer() {
  const session = await auth();
  if (!session?.user || session.user.role !== "CLIENT") redirect("/sign-in");

  const clientUser = await prisma.clientUser.findUnique({
    where: { userId: session.user.id },
    include: { user: true, client: true },
  });
  if (!clientUser) redirect("/sign-in");
  // Phase T2: "last seen" for the PM's onboarding checklist, written at most once an hour.
  if (!clientUser.user.lastSeenAt || Date.now() - clientUser.user.lastSeenAt.getTime() > 3600_000) {
    void prisma.user.update({ where: { id: clientUser.userId }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }

  return clientUser;
}

export async function getOpsViewer() {
  const session = await auth();
  if (!session?.user || session.user.role !== "INTERNAL") redirect("/sign-in");

  const staffMember = await prisma.staffMember.findUnique({
    where: { userId: session.user.id },
    include: { user: true },
  });
  if (!staffMember) redirect("/sign-in");

  return staffMember;
}
