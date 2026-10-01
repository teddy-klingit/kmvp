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
