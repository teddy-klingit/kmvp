import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { templateSkillKey } from "@/lib/skills";

/** "Use" on a template: counts the use, then opens the skill it runs with, started from this template. */
export async function GET(req: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const session = await auth();
  if (!session?.user || session.user.role !== "CLIENT") return new Response("Not found", { status: 404 });
  const member = await prisma.clientUser.findUnique({ where: { userId: session.user.id }, select: { clientId: true } });
  const template = member && (await prisma.template.findFirst({ where: { id: templateId, OR: [{ clientId: member.clientId }, { clientId: null }] } }));
  if (!template) return new Response("Not found", { status: 404 });
  await prisma.template.update({ where: { id: template.id }, data: { usageCount: { increment: 1 } } });
  const skill = await prisma.agent.findFirst({ where: { key: templateSkillKey(template), kind: "SKILL" }, select: { id: true } });
  return NextResponse.redirect(new URL(skill ? `/skills/${skill.id}?template=${template.id}` : "/assets/visual-identity#layouts", req.url));
}
