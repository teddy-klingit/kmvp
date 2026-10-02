import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** "Use" on a template: counts the use (the card's "Used N×" is this number), then opens it in Figma or its page. */
export async function GET(req: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const session = await auth();
  if (!session?.user || session.user.role !== "CLIENT") return new Response("Not found", { status: 404 });
  const member = await prisma.clientUser.findUnique({ where: { userId: session.user.id }, select: { clientId: true } });
  const template = member && (await prisma.template.findFirst({ where: { id: templateId, OR: [{ clientId: member.clientId }, { clientId: null }] } }));
  if (!template) return new Response("Not found", { status: 404 });
  await prisma.template.update({ where: { id: template.id }, data: { usageCount: { increment: 1 } } });
  return NextResponse.redirect(template.figmaUrl ?? new URL(`/assets/agents-templates/templates/${template.id}`, req.url));
}
