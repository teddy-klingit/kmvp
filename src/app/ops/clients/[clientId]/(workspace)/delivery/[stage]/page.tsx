import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { NavTabs } from "@/components/ui/nav-tabs";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/ui/avatar";
import { GenerateEstimateButton } from "@/components/ops/generate-estimate-button";
import { Check, Star, Clock, History } from "lucide-react";
import { cn, jsonArray, formatDate } from "@/lib/utils";
import { STAGE_TABS, type StageSlug } from "@/lib/pipeline-tabs";
import { INTERNAL_ROLE_LABEL } from "@/lib/labels";
import { computeStaffingSuggestions } from "@/lib/staffing";
import {
  acceptBriefAsIsAction,
  requestBriefFromClientAction,
  sendEstimateToClientAction,
  confirmTeamAction,
  approveProductionBatchAction,
  sendBackToProductionAction,
  passQaSendToDeliveryAction,
  sendDeliveryToClientAction,
  sendFeedbackToProductionAction,
  sendSignOffReminderAction,
} from "@/lib/actions/ops-pipeline-actions";
import { classifyFeedbackWithAiAction } from "@/lib/actions/ops-ai-actions";
import { assignStaffToTeamAction, removeTeamMemberAction } from "@/lib/actions/staffing-actions";

function AgentHeader({ initials, name, subtitle, dotTone = "success" }: { initials: string; name: string; subtitle: string; dotTone?: "success" | "warning" | "neutral" }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xs font-semibold text-ink">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{name}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          dotTone === "success" && "bg-success",
          dotTone === "warning" && "bg-accent",
          dotTone === "neutral" && "bg-border"
        )}
      />
    </Card>
  );
}

function ChecklistRow({ label, detail, done, tone }: { label: string; detail?: string; done: boolean; tone?: "accent" }) {
  return (
    <div className="flex items-start gap-3 px-5 py-3.5">
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border-2",
          done ? "border-success bg-success text-ink" : tone === "accent" ? "border-accent" : "border-border"
        )}
      >
        {done && <Check className="size-2.5" />}
      </span>
      <div>
        <p className="text-sm font-medium">{label}</p>
        {detail && <p className={cn("text-sm", tone === "accent" && !done ? "text-ink" : "text-muted-foreground")}>{detail}</p>}
      </div>
    </div>
  );
}

export default async function PipelineStagePage({
  params,
}: {
  params: Promise<{ clientId: string; stage: string }>;
}) {
  const { clientId, stage } = await params;
  const slug = stage as StageSlug;
  if (!STAGE_TABS.some((t) => t.slug === slug)) notFound();

  const project = await prisma.project.findFirst({
    where: { clientId, status: { notIn: ["ARCHIVED", "DELIVERED"] } },
    orderBy: { updatedAt: "desc" },
    include: {
      brief: true,
      estimate: { include: { lineItems: { orderBy: { order: "asc" } } } },
      team: { include: { members: { include: { staffMember: { include: { user: true } } } } } },
      assets: true,
      pipelineStages: true,
      comments: {
        where: { archivedAt: null },
        include: { clientAuthor: { include: { user: true } } },
        orderBy: { createdAt: "desc" },
      },
      client: { include: { users: { include: { user: true } } } },
    },
  });

  const brandOS = await prisma.brandOS.findUnique({ where: { clientId } });

  const allStaff =
    slug === "staffing"
      ? await prisma.staffMember.findMany({
          include: {
            user: true,
            teamMemberships: { include: { team: { include: { project: { include: { client: true } } } } } },
          },
          orderBy: { createdAt: "asc" },
        })
      : [];

  // Per-project agent activity — so a PM sees what an agent asked or sent on
  // this specific project without needing to approve it beforehand. Scoped
  // here rather than the global /ops/agents/audit feed.
  const agentRuns =
    slug === "staffing" && project
      ? await prisma.agentRun.findMany({
          where: { projectId: project.id },
          include: { agent: true, requestedByUser: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
      : [];

  return (
    <div className="flex flex-col gap-6">
      <NavTabs
        size="sm"
        items={STAGE_TABS.map((t) => ({ label: t.label, href: `/ops/clients/${clientId}/delivery/${t.slug}` }))}
      />

      {!project ? (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">No active project for this client right now.</p>
        </Card>
      ) : (
        <StageContent slug={slug} clientId={clientId} project={project} brandOS={brandOS} allStaff={allStaff} agentRuns={agentRuns} />
      )}
    </div>
  );
}

type AgentRunWithRelations = Awaited<ReturnType<typeof prisma.agentRun.findMany<{
  include: { agent: true; requestedByUser: true };
}>>>;

type ProjectWithRelations = NonNullable<Awaited<ReturnType<typeof prisma.project.findFirst<{
  include: {
    brief: true;
    estimate: { include: { lineItems: true } };
    team: { include: { members: { include: { staffMember: { include: { user: true } } } } } };
    assets: true;
    pipelineStages: true;
    comments: { include: { clientAuthor: { include: { user: true } } } };
    client: { include: { users: { include: { user: true } } } };
  };
}>>>>;

type StaffWithHistory = Awaited<ReturnType<typeof prisma.staffMember.findMany<{
  include: {
    user: true;
    teamMemberships: { include: { team: { include: { project: { include: { client: true } } } } } };
  };
}>>>;

function StageContent({
  slug,
  clientId,
  project,
  brandOS,
  allStaff,
  agentRuns,
}: {
  slug: StageSlug;
  clientId: string;
  project: ProjectWithRelations;
  brandOS: Awaited<ReturnType<typeof prisma.brandOS.findUnique>>;
  allStaff: StaffWithHistory;
  agentRuns: AgentRunWithRelations;
}) {
  switch (slug) {
    case "foundation":
      return (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <SectionLabel>Brand context agents</SectionLabel>
            <Card className="divide-y divide-border p-0">
              <ChecklistRow label="Brand OS agent" detail="Maintains brand rules · updated from every deliverable" done />
              <ChecklistRow label="Guidelines agent" detail="AI brand guidelines, tone of voice, naming" done />
              <ChecklistRow label="Asset indexer" detail={`Figma library sync · ${brandOS?.indexedAssetsCount ?? 0} assets tagged`} done={false} />
              <ChecklistRow label="Benchmark agent" detail="Quality benchmarks from approved work" done />
            </Card>
          </div>
          <div className="flex flex-col gap-3">
            <SectionLabel>Foundation health</SectionLabel>
            <div className="grid grid-cols-2 gap-4">
              <Card className="border border-border bg-paper p-4">
                <p className="font-display text-2xl font-light text-primary">{brandOS?.foundationPct ?? 0}%</p>
                <p className="text-xs text-muted-foreground">Brand Context Brain complete</p>
              </Card>
              <Card className="border border-border bg-paper p-4">
                <p className="font-display text-2xl font-light">{brandOS?.indexedAssetsCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">Indexed assets</p>
              </Card>
              <Card className="border border-border bg-paper p-4">
                <p className="font-display text-2xl font-light">{brandOS?.brandOsRulesCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">Brand OS rules</p>
              </Card>
              <Card className="border border-border bg-paper p-4">
                <p className="font-display text-2xl font-light">{brandOS?.toneGuidelinesCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">Tone guidelines</p>
              </Card>
            </div>
          </div>
        </div>
      );

    case "brief": {
      const brief = project.brief;
      const items = [
        { label: "Objective defined", detail: brief?.goals, key: "goals" },
        { label: "Audience specified", detail: brief?.targetAudience, key: "targetAudience" },
        { label: "Success metrics", detail: brief?.successMetrics, key: "successMetrics" },
        { label: "Reference examples", detail: brief?.references, key: "references" },
      ];
      const gaps = jsonArray<string>(brief?.gapsFlagged);
      return (
        <div className="flex flex-col gap-6">
          <AgentHeader
            initials="BR"
            name="Brief agent"
            subtitle={brief?.aiSummary ? "Reviewed brief against brand context" : "Parsing brief, cross-checking brand context"}
            dotTone={gaps.length ? "warning" : brief?.aiSummary ? "success" : "neutral"}
          />
          {brief?.aiSummary && (
            <Card className="border-l-4 border-l-accent p-4">
              <p className="text-sm font-medium">{brief.aiSummary}</p>
              {brief.aiQualityScore !== null && (
                <p className="mt-1 text-xs text-muted-foreground">AI readiness score: {brief.aiQualityScore}/100</p>
              )}
            </Card>
          )}
          <div className="flex flex-col gap-3">
            <SectionLabel>Brief checklist</SectionLabel>
            <Card className="divide-y divide-border p-0">
              {items.map((it) => (
                <ChecklistRow key={it.key} label={it.label} detail={it.detail ?? "Flagged by agent — missing"} done={Boolean(it.detail)} tone="accent" />
              ))}
            </Card>
          </div>
          {jsonArray<string>(brief?.emphasizedColors).length > 0 && (
            <div className="flex flex-col gap-3">
              <SectionLabel>Client wants to emphasize</SectionLabel>
              <div className="flex gap-2">
                {jsonArray<string>(brief?.emphasizedColors).map((hex) => (
                  <span key={hex} className="size-8 rounded-full border border-border" style={{ backgroundColor: hex }} title={hex} />
                ))}
              </div>
            </div>
          )}
          {gaps.length > 0 && (
            <div className="flex flex-col gap-3">
              <SectionLabel>AI-flagged gaps</SectionLabel>
              <Card className="divide-y divide-border p-0">
                {gaps.map((gap, i) => (
                  <ChecklistRow key={i} label={gap} done={false} tone="accent" />
                ))}
              </Card>
            </div>
          )}
          {brief && brief.status !== "ACCEPTED" && (
            <form className="flex gap-2">
              <input type="hidden" name="briefId" value={brief.id} />
              <input type="hidden" name="clientId" value={clientId} />
              <Button formAction={requestBriefFromClientAction} variant="secondary">
                Request from client
              </Button>
              <Button formAction={acceptBriefAsIsAction}>Accept as-is</Button>
            </form>
          )}
        </div>
      );
    }

    case "estimate": {
      const estimate = project.estimate;
      if (!estimate) {
        if (!project.brief || project.brief.status !== "ACCEPTED") {
          return <EmptyStageCard text="No estimate scoped yet — waiting on brief acceptance." />;
        }
        return (
          <div className="flex flex-col gap-6">
            <AgentHeader initials="ES" name="Estimate agent" subtitle="Ready to scope from the accepted brief" dotTone="neutral" />
            <Card className="flex flex-col gap-3 p-6">
              <p className="text-sm text-muted-foreground">
                The brief has been accepted. Generate a scoped estimate, priced against the Price List.
              </p>
              <GenerateEstimateButton projectId={project.id} clientId={clientId} />
            </Card>
          </div>
        );
      }
      const unresolvedNeeds = jsonArray<{ description: string; reason: string }>(estimate.unresolvedNeeds);
      return (
        <div className="flex flex-col gap-6">
          <AgentHeader initials="ES" name="Estimate agent" subtitle="Priced from the Price List" />
          <div className="flex flex-col gap-3">
            <SectionLabel>Scope</SectionLabel>
            <Card className="divide-y divide-border p-0">
              {estimate.lineItems.length === 0 && (
                <p className="px-5 py-4 text-sm text-muted-foreground">No priced line items — everything needed fell into unresolved needs below.</p>
              )}
              {estimate.lineItems.map((li) => (
                <div key={li.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium">{li.deliverable}</p>
                    <p className="text-sm text-muted-foreground">{li.detail}</p>
                  </div>
                  <p className="text-sm font-semibold">{li.credits}c</p>
                </div>
              ))}
              <div className="flex items-center justify-between bg-muted/40 px-5 py-3.5 font-semibold">
                <p className="text-sm">Total</p>
                <p className="text-sm">{estimate.totalCredits}c</p>
              </div>
            </Card>
          </div>
          {unresolvedNeeds.length > 0 && (
            <div className="flex flex-col gap-3">
              <SectionLabel>Needs manual pricing</SectionLabel>
              <Card className="flex flex-col gap-2 bg-warning-soft p-4">
                <p className="text-xs text-muted-foreground">
                  The Estimate agent found no Price List match for these — it did not guess a cost. Price them manually and add rows to the
                  Price List if they'll come up again.
                </p>
                <div className="flex flex-col gap-2">
                  {unresolvedNeeds.map((n, i) => (
                    <div key={i} className="rounded-lg border border-border bg-paper p-3">
                      <p className="text-sm font-medium">{n.description}</p>
                      <p className="text-xs text-muted-foreground">{n.reason}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
          {estimate.status === "DRAFT" && (
            <form className="flex gap-2">
              <input type="hidden" name="estimateId" value={estimate.id} />
              <input type="hidden" name="clientId" value={clientId} />
              <Button formAction={sendEstimateToClientAction}>Send to client</Button>
              <Button variant="secondary" type="button">
                Edit scope
              </Button>
            </form>
          )}
          {estimate.status !== "DRAFT" && <Badge tone="info">Estimate {estimate.status.toLowerCase().replace("_", " ")}</Badge>}
        </div>
      );
    }

    case "staffing": {
      const team = project.team;
      const assignedIds = new Set((team?.members ?? []).map((m) => m.staffMemberId));
      const candidates = allStaff.filter((s) => !assignedIds.has(s.id) && s.title !== "ADMIN");
      const suggestions = computeStaffingSuggestions(candidates, { projectType: project.type, clientId });

      return (
        <div className="flex flex-col gap-6">
          <AgentHeader
            initials="ST"
            name="Staffing agent"
            subtitle="Ranked by availability, skill match, client history, and rating"
          />

          {team && team.members.length > 0 && (
            <div className="flex flex-col gap-3">
              <SectionLabel>Current team</SectionLabel>
              <Card className="divide-y divide-border p-0">
                {team.members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <PersonAvatar name={m.staffMember.user.name} size="sm" />
                      <div>
                        <p className="text-sm font-medium">
                          {m.staffMember.user.name} · {m.roleOnProject}
                        </p>
                        <p className="text-xs text-muted-foreground">{m.allocatedHours}h allocated this sprint</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={m.recommended ? "success" : "neutral"}>{m.recommended ? "Recommended" : "Added"}</Badge>
                      {!team.confirmed && (
                        <form action={removeTeamMemberAction}>
                          <input type="hidden" name="teamMemberId" value={m.id} />
                          <input type="hidden" name="clientId" value={clientId} />
                          <Button type="submit" size="sm" variant="ghost">
                            Remove
                          </Button>
                        </form>
                      )}
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          )}

          {!team?.confirmed && (
            <div className="flex flex-col gap-3">
              <SectionLabel>Suggested for this project</SectionLabel>
              {suggestions.length === 0 ? (
                <EmptyStageCard text="Everyone available has already been added to this team." />
              ) : (
                <Card className="divide-y divide-border p-0">
                  {suggestions.map((s) => (
                    <div key={s.staffMemberId} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <PersonAvatar name={s.name} size="sm" />
                        <div>
                          <p className="text-sm font-medium">
                            {s.name} · {INTERNAL_ROLE_LABEL[s.title]}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="size-3" />
                              {s.availableHours}h free / {s.capacityHoursPerWeek}h
                            </span>
                            <span className="flex items-center gap-1">
                              <Star className="size-3" />
                              {s.performanceRating.toFixed(1)}
                            </span>
                            {s.workedWithClientBefore && (
                              <span className="flex items-center gap-1">
                                <History className="size-3" />
                                Worked with this client
                              </span>
                            )}
                            {s.matchedSkills.length > 0 && <span>Skills: {s.matchedSkills.join(", ")}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={s.overallScore >= 75 ? "success" : s.overallScore >= 55 ? "info" : "neutral"}>
                          {s.overallScore}% match
                        </Badge>
                        <form action={assignStaffToTeamAction} className="flex items-center gap-1.5">
                          <input type="hidden" name="projectId" value={project.id} />
                          <input type="hidden" name="clientId" value={clientId} />
                          <input type="hidden" name="staffMemberId" value={s.staffMemberId} />
                          <input type="hidden" name="roleOnProject" value={INTERNAL_ROLE_LABEL[s.title]} />
                          <input type="hidden" name="allocatedHours" value={Math.min(16, s.availableHours || 8)} />
                          <input type="hidden" name="recommended" value={s.overallScore >= 75 ? "true" : "false"} />
                          <Button type="submit" size="sm" variant="secondary">
                            Add to team
                          </Button>
                        </form>
                      </div>
                    </div>
                  ))}
                </Card>
              )}
            </div>
          )}

          {team && team.members.length > 0 && !team.confirmed && (
            <form>
              <input type="hidden" name="teamId" value={team.id} />
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="clientId" value={clientId} />
              <Button formAction={confirmTeamAction}>Confirm team</Button>
            </form>
          )}
          {team?.confirmed && <Badge tone="success">Team confirmed</Badge>}

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <SectionLabel>Agent activity on this project</SectionLabel>
              <a href={`/ops/agents/audit?projectId=${project.id}`} className="text-xs font-medium text-primary hover:underline">
                Full decision log →
              </a>
            </div>
            {agentRuns.length === 0 ? (
              <Card className="p-5">
                <p className="text-sm text-muted-foreground">No agent runs recorded for this project yet.</p>
              </Card>
            ) : (
              <Card className="divide-y divide-border p-0">
                {agentRuns.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.decision ?? `${r.agent.name} ran`}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.agent.name}
                        {r.requestedByUser ? ` · requested by ${r.requestedByUser.name}` : " · internal pipeline run"} ·{" "}
                        {formatDate(r.createdAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <Badge tone={r.status === "SUCCESS" ? "success" : r.status === "FLAGGED" ? "warning" : "danger"}>{r.status}</Badge>
                  </div>
                ))}
              </Card>
            )}
          </div>
        </div>
      );
    }

    case "production": {
      const inReview = project.assets.filter((a) => a.status === "IN_REVIEW");
      return (
        <div className="flex flex-col gap-6">
          <AgentHeader initials="AG" name="Ad gen agent" subtitle={`Social formats — ${project.assets.length - inReview.length}/${project.assets.length || 0} complete`} dotTone={inReview.length ? "warning" : "success"} />
          <div className="flex flex-col gap-3">
            <SectionLabel>Ready for review</SectionLabel>
            {project.assets.length === 0 ? (
              <EmptyStageCard text="No assets generated yet." />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {project.assets.map((a) => (
                  <div key={a.id} className="flex flex-col gap-1">
                    <div className="flex aspect-square items-end rounded-xl p-2" style={{ backgroundColor: a.thumbnailColor }}>
                      <span className="rounded-full bg-black/40 px-2 py-0.5 text-xs font-medium text-white">{a.format}</span>
                    </div>
                    <Badge tone={a.status === "APPROVED" ? "success" : "warning"} className="w-fit">
                      {a.status === "APPROVED" ? "Approved" : "In review"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
          {inReview.length > 0 && (
            <form className="flex gap-2">
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="clientId" value={clientId} />
              <Button formAction={approveProductionBatchAction}>Approve batch</Button>
              <Button type="button" variant="secondary">
                Request revision
              </Button>
            </form>
          )}
        </div>
      );
    }

    case "qa": {
      const stage = project.pipelineStages.find((s) => s.name === "QA");
      const passed = project.assets.filter((a) => a.status === "APPROVED").length;
      const flagged = Math.max(0, project.assets.length - passed);
      return (
        <div className="flex flex-col gap-6">
          <AgentHeader initials="QA" name="QA agent" subtitle={`${passed}/${project.assets.length} assets checked · ${flagged} flagged`} dotTone={flagged ? "warning" : "success"} />
          <div className="grid grid-cols-2 gap-4">
            <Card className="border border-border bg-paper p-4">
              <p className="font-display text-2xl font-light text-success-foreground">{passed}</p>
              <p className="text-xs text-muted-foreground">Passed</p>
            </Card>
            <Card className="border border-border bg-paper p-4">
              <p className="font-display text-2xl font-light text-ink">{flagged}</p>
              <p className="text-xs text-muted-foreground">Flagged</p>
            </Card>
          </div>
          {flagged > 0 && (
            <div className="flex flex-col gap-3">
              <SectionLabel>Flags to resolve</SectionLabel>
              <Card className="divide-y divide-border p-0">
                <ChecklistRow label="Typeface weight off-brand" detail="Brand OS: headlines must be bold, not medium" done={false} tone="accent" />
                <ChecklistRow label="CTA colour off-brand" detail="Used a non-brand hex — should match approved palette" done={false} tone="accent" />
              </Card>
            </div>
          )}
          {stage?.status === "ACTIVE" && (
            <form className="flex gap-2">
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="clientId" value={clientId} />
              {flagged > 0 ? (
                <Button formAction={sendBackToProductionAction} variant="secondary">
                  Send back to production
                </Button>
              ) : (
                <Button formAction={passQaSendToDeliveryAction}>Pass QA — send to delivery</Button>
              )}
            </form>
          )}
        </div>
      );
    }

    case "delivery": {
      const stage = project.pipelineStages.find((s) => s.name === "FIRST_DRAFT_DELIVERY");
      const allApproved = project.assets.length > 0 && project.assets.every((a) => a.status === "APPROVED" || a.status === "DELIVERED");
      return (
        <div className="flex flex-col gap-6">
          <AgentHeader initials="DL" name="Delivery agent" subtitle={`${project.assets.length} assets packaged · handoff link ready`} />
          <div className="flex flex-col gap-3">
            <SectionLabel>Package checklist</SectionLabel>
            <Card className="divide-y divide-border p-0">
              <ChecklistRow label={`${project.assets.length} assets in correct spec and naming`} done />
              <ChecklistRow label="Usage guide generated" done />
              <ChecklistRow label="Client-facing Figma link included" done />
              <ChecklistRow label="Client approval pending" done={stage?.status === "COMPLETED"} />
            </Card>
          </div>
          {stage?.status !== "COMPLETED" && (
            <form className="flex gap-2">
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="clientId" value={clientId} />
              <Button formAction={sendDeliveryToClientAction} disabled={!allApproved}>
                Send to client
              </Button>
              <Button type="button" variant="secondary">
                Preview handoff
              </Button>
            </form>
          )}
        </div>
      );
    }

    case "feedback": {
      const comments = project.comments;
      const stage = project.pipelineStages.find((s) => s.name === "FEEDBACK");
      return (
        <div className="flex flex-col gap-6">
          <AgentHeader initials="FB" name="Feedback agent" subtitle={`${comments.length} comments received · structured into tasks`} />
          <div className="flex flex-col gap-3">
            <SectionLabel>Client comments → tasks</SectionLabel>
            {comments.length === 0 ? (
              <EmptyStageCard text="No client feedback yet." />
            ) : (
              <Card className="divide-y divide-border p-0">
                {comments.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <div>
                      <p className="text-sm font-medium">{c.agentTaskSummary ?? c.body}</p>
                      <p className="text-xs text-muted-foreground">
                        From {c.clientAuthor?.user.name ?? "Client"}
                        {c.agentTaskSummary && ` · "${c.body}"`}
                      </p>
                    </div>
                    {c.agentPriority ? (
                      <Badge tone={c.agentPriority === "High" ? "danger" : c.agentPriority === "Medium" ? "warning" : "neutral"}>
                        {c.agentPriority}
                      </Badge>
                    ) : (
                      <form action={classifyFeedbackWithAiAction}>
                        <input type="hidden" name="commentId" value={c.id} />
                        <input type="hidden" name="clientId" value={clientId} />
                        <Button type="submit" size="sm" variant="secondary">
                          Classify with AI
                        </Button>
                      </form>
                    )}
                  </div>
                ))}
              </Card>
            )}
          </div>
          {stage?.status === "ACTIVE" && (
            <form>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="clientId" value={clientId} />
              <Button formAction={sendFeedbackToProductionAction}>Send to production</Button>
            </form>
          )}
        </div>
      );
    }

    case "final": {
      const stage = project.pipelineStages.find((s) => s.name === "FINAL_DELIVERY");
      const owner = project.client.users.find((u) => u.permission === "OWNER");
      return (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <SectionLabel>Final checklist</SectionLabel>
            <Card className="divide-y divide-border p-0">
              <ChecklistRow label="All feedback revisions completed" done={stage?.status !== "UPCOMING"} />
              <ChecklistRow label="QA agent re-checked final versions" done={stage?.status !== "UPCOMING"} />
              <ChecklistRow label="Final Figma file exported and named" done={stage?.status !== "UPCOMING"} />
              <ChecklistRow label="Handoff page updated" done={stage?.status !== "UPCOMING"} />
              <ChecklistRow label="Waiting for client sign-off" done={project.status === "DELIVERED" || project.status === "ARCHIVED"} tone="accent" />
            </Card>
          </div>
          {owner && (
            <div className="flex flex-col gap-3">
              <SectionLabel>Client status</SectionLabel>
              <Card className="flex items-center gap-3 p-4">
                <PersonAvatar name={owner.user.name} size="sm" />
                <div>
                  <p className="text-sm font-medium">
                    {owner.user.name} · {project.client.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {project.status === "DELIVERED" || project.status === "ARCHIVED" ? "Signed off" : "Awaiting sign-off"}
                  </p>
                </div>
              </Card>
            </div>
          )}
          {project.status !== "DELIVERED" && project.status !== "ARCHIVED" && (
            <form>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="clientId" value={clientId} />
              <Button formAction={sendSignOffReminderAction} variant="secondary">
                Send reminder
              </Button>
            </form>
          )}
        </div>
      );
    }

    case "archive":
      return (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <SectionLabel>Archive agents</SectionLabel>
            <Card className="divide-y divide-border p-0">
              <ChecklistRow label="Archive agent" detail="Indexing assets, updating brand OS" done={false} />
              <ChecklistRow label="Learning agent" detail="Extracting insights from feedback and QA flags" done={false} />
            </Card>
          </div>
          <div className="flex flex-col gap-3">
            <SectionLabel>Learnings extracted</SectionLabel>
            <Card className="divide-y divide-border p-0">
              <ChecklistRow label="Mobile headline size rule added to brand OS" detail="+1 rule to benchmark agent" done />
              <ChecklistRow label="Story motion flagged as high-performing format" detail="Surfaced in next brief suggestion" done />
              <ChecklistRow label="A/B result pending" detail="Updates benchmarks when data arrives" done={false} />
            </Card>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Card className="border border-border bg-paper p-4">
              <p className="font-display text-2xl font-light">{project.assets.length}</p>
              <p className="text-xs text-muted-foreground">Assets archived</p>
            </Card>
            <Card className="border border-border bg-paper p-4">
              <p className="font-display text-2xl font-light">3</p>
              <p className="text-xs text-muted-foreground">Rules updated</p>
            </Card>
          </div>
        </div>
      );

    default:
      return null;
  }
}

function EmptyStageCard({ text }: { text: string }) {
  return (
    <Card className="p-6">
      <p className="text-sm text-muted-foreground">{text}</p>
    </Card>
  );
}
