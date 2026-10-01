import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { getPortalViewer } from "@/lib/current-viewer";
import { NavTabs } from "@/components/ui/nav-tabs";
import { StageBadge } from "@/components/portal/stage-badge";
import { CompactTimeline } from "@/components/portal/project/compact-timeline";
import { TimelineScroller } from "@/components/portal/project/timeline-scroller";
import { ShareDialog } from "@/components/portal/project/share-dialog";
import { ProjectAccessPanel } from "@/components/portal/project/project-access-panel";
import { KeyFacts, KlingitTeam } from "@/components/portal/project/key-facts";
import { ProjectConversation } from "@/components/portal/project/project-conversation";
import { ChatSheet } from "@/components/portal/project/chat-sheet";
import { loadProjectState } from "@/lib/project-state-loader";
import { loadProjectConversation } from "@/lib/project-conversation";

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
  const conversation = await loadProjectConversation(id, viewer);

  const tabs = [
    { label: "Overview", href: `/projects/${id}` },
    { label: "Work", href: `/projects/${id}/work` },
    { label: "Brief & scope", href: `/projects/${id}/scope` },
    ...(state.stage === "closed" ? [{ label: "Request changes", href: `/projects/${id}/change-request` }] : []),
  ];

  const conversationPanel = (
    <Suspense>
      <ProjectConversation projectId={id} conversation={conversation} className="flex-1" />
    </Suspense>
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-4">
        <Link href="/projects" className="text-sm text-primary hover:underline">
          &lt; All projects
        </Link>
        <div className="flex items-start justify-between gap-4">
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 font-display text-[22px] font-light leading-tight tracking-tight text-ink md:text-[28px]">
            {project.name}
            <StageBadge state={state} />
            {project.confidential && (
              <span className="flex items-center gap-1 font-sans text-xs font-medium text-muted-foreground">
                <Lock className="size-3" />
                Confidential
              </span>
            )}
          </h1>
          <Suspense>
            <ShareDialog projectName={project.name}>
              <ProjectAccessPanel projectId={id} viewer={viewer} />
            </ShareDialog>
          </Suspense>
        </div>
        {!state.archived && (
          <TimelineScroller>
            <CompactTimeline timeline={state.timeline} />
          </TimelineScroller>
        )}
        <div className="md:hidden">
          <KeyFacts state={state} compact />
        </div>
        <NavTabs items={tabs} />
      </header>

      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">{children}</div>
        <aside className="sticky top-0 hidden max-h-[calc(100vh-4rem)] w-[360px] shrink-0 flex-col gap-5 md:flex">
          <KeyFacts state={state} />
          <KlingitTeam state={state} />
          {conversationPanel}
        </aside>
      </div>

      <Suspense>
        <ChatSheet unread={conversation.unread.klingit + conversation.unread.internal}>
          <KlingitTeam state={state} />
          {conversationPanel}
        </ChatSheet>
      </Suspense>
    </div>
  );
}
