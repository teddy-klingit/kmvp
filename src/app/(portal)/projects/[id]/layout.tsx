import { Suspense } from "react";
import Link from "next/link";
import { OpenConversationFromQuery } from "@/components/ds/open-conversation-from-query";
import { scheduleAutopilot } from "@/lib/autopilot-schedule";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { ConversationProvider } from "@/components/ds/conversation-context";
import { ConversationPanel } from "@/components/ds/conversation-panel";
import { PageTabs } from "@/components/ds/tabs";
import { ProjectHeaderCard } from "@/components/portal/project/project-header-card";
import { ShareDialog } from "@/components/portal/project/share-dialog";
import { ProjectAccessPanel } from "@/components/portal/project/project-access-panel";
import { loadProjectState } from "@/lib/project-state-loader";
import { loadProjectConversation } from "@/lib/project-conversation";
import { postCommentAction } from "@/lib/actions/project-actions";
import { markChannelReadAction, postInternalMessageAction } from "@/lib/actions/conversation-actions";
import { clientVisibleAsset } from "@/lib/qc/visibility";
import { agentBuildOf } from "@/lib/agent-build";
import { AgentBuildView } from "@/components/portal/project/agent-build-view";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await getPortalViewer();
  const loaded = await loadProjectState(id, viewer.clientId, viewer.id);
  if (!loaded) notFound();
  const { project, state } = loaded;

  // An agent build has its own project view (AgentProject.dc.html).
  if (project.agentBuild) {
    const build = agentBuildOf(await prisma.brief.findUnique({ where: { projectId: id }, select: { agentDrafts: true } }));
    if (build)
      return (
        <AgentBuildView
          projectId={id}
          viewer={viewer}
          build={build}
          share={
            <Suspense>
              <ShareDialog projectName={project.name}>
                <ProjectAccessPanel projectId={id} viewer={viewer} />
              </ShareDialog>
            </Suspense>
          }
        />
      );
  }

  scheduleAutopilot(id);
  const [conversation, assetCounts] = await Promise.all([
    loadProjectConversation(id, viewer, state.keyFacts.staffedTeam),
    prisma.asset.groupBy({ by: ["status"], where: { projectId: id, ...clientVisibleAsset }, _count: true }),
  ]);
  const total = assetCounts.reduce((n, a) => n + a._count, 0);
  const approved = assetCounts.filter((a) => a.status === "APPROVED" || a.status === "DELIVERED").reduce((n, a) => n + a._count, 0);

  const tabs = [
    { label: "Overview", href: `/projects/${id}` },
    { label: "Work", href: `/projects/${id}/work` },
    { label: "Brief & scope", href: `/projects/${id}/scope` },
    ...(state.stage === "closed" ? [{ label: "Request changes", href: `/projects/${id}/change-request` }] : []),
  ];

  return (
    <ConversationProvider defaultChannel="klingit">
      <Suspense fallback={null}>
        <OpenConversationFromQuery />
      </Suspense>
      {/* PortalMain renders project pages full-bleed, so the panel runs full height down the right edge. */}
      <div className="flex min-h-full">
        <div className="@container/main min-w-0 flex-1 px-4 pb-24 pt-6 md:px-10 md:pb-12 md:pt-8">
          <div className="mx-auto flex max-w-[1040px] flex-col gap-5">
            <Link
              href="/projects"
              className="inline-flex items-center gap-1.5 self-start text-[13px] text-ds-text-2 no-underline hover:text-ds-text"
            >
              <ChevronLeft className="size-4" strokeWidth={1.75} />
              All projects
            </Link>
            <ProjectHeaderCard
              project={project}
              state={state}
              assets={{ total, approved }}
              share={
                <Suspense>
                  <ShareDialog projectName={project.name}>
                    <ProjectAccessPanel projectId={id} viewer={viewer} />
                  </ShareDialog>
                </Suspense>
              }
            />
            <PageTabs label="Project sections" items={tabs} />
            {children}
          </div>
        </div>
        <ConversationPanel
          projectId={id}
          storageKey={`klingit.conversation.${viewer.userId}`}
          participants={conversation.participants.map((p) => p.name)}
          markRead={markChannelReadAction}
          channels={[
            {
              key: "klingit",
              label: "With Klingit",
              unread: conversation.unread.klingit,
              hint: conversation.hints.klingit,
              placeholder: conversation.placeholders.klingit,
              messages: conversation.klingit,
              post: postCommentAction,
              readKey: "KLINGIT",
              suggestions: ["When will I see a first draft?", "Can we change the deadline?", "Who's working on this?"],
            },
            {
              key: "internal",
              label: "Internal",
              locked: true,
              unread: conversation.unread.internal,
              hint: conversation.hints.internal,
              placeholder: conversation.placeholders.internal,
              messages: conversation.internal,
              post: postInternalMessageAction,
              readKey: "INTERNAL",
              suggestions: ["Can you check this before I approve?", "Does this match the brief?"],
            },
          ]}
        />
      </div>
    </ConversationProvider>
  );
}
