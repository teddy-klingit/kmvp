import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { BriefStudio } from "@/components/portal/brief-studio/brief-studio";

/**
 * Every way of starting work lands here. With ?q= (typed elsewhere) that text becomes the first message;
 * otherwise the studio waits for it, offering the client's unfinished drafts.
 */
export default async function NewBriefPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const viewer = await getPortalViewer();
  const drafts = await prisma.project.findMany({
    where: { clientId: viewer.clientId, status: "DRAFT", brief: { status: "DRAFT" }, ...projectVisibilityWhere(viewer.id) },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true },
    take: 3,
  });
  return <BriefStudio initial={null} viewerName={viewer.user.name} start={q?.trim() || undefined} drafts={drafts} />;
}
