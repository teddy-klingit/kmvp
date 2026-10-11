import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { loadProjectState } from "@/lib/project-state-loader";
import { agentBuildOf } from "@/lib/agent-build";
import { SkillBuildView } from "@/components/portal/skills/skill-build-view";
import { ShareDialog } from "@/components/portal/project/share-dialog";
import { ProjectAccessPanel } from "@/components/portal/project/project-access-panel";

/** Skills → a custom skill Klingit is building (nav v3, 05). Same visibility as the project it is. */
export default async function SkillBuildPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const viewer = await getPortalViewer();
  const loaded = await loadProjectState(projectId, viewer.clientId, viewer.id);
  if (!loaded?.project.agentBuild) notFound();
  const build = agentBuildOf(await prisma.brief.findUnique({ where: { projectId }, select: { agentDrafts: true } }));
  if (!build) notFound();
  return (
    <SkillBuildView
      projectId={projectId}
      viewer={viewer}
      build={build}
      share={
        <Suspense>
          <ShareDialog projectName={loaded.project.name}>
            <ProjectAccessPanel projectId={projectId} viewer={viewer} />
          </ShareDialog>
        </Suspense>
      }
    />
  );
}
