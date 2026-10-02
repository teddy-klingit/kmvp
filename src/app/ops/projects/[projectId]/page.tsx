import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, ImageIcon, Lock, Play } from "lucide-react";
import { getOpsViewer } from "@/lib/current-viewer";
import { roleTierFor } from "@/lib/role-tier";
import { loadCockpit, INTERNAL_STAGE_PILL, type Cockpit } from "@/lib/ops-cockpit";
import { activityFeed, clientThread, staffNotesThread, type ActivityItem } from "@/lib/ops-feed";
import { scheduleAutopilot } from "@/lib/autopilot-schedule";
import { PROJECT_TYPE_LABEL, INTERNAL_ROLE_LABEL } from "@/lib/labels";
import { formatDay, shortDate } from "@/lib/project-state";
import { COMPLEXITY_LABEL, lineName } from "@/lib/estimate-display";
import { assetTitle, formatLabel } from "@/lib/asset-display";
import { AUTO_SEND_CREDIT_CAP } from "@/lib/autopilot";
import { Card } from "@/components/ds/card";
import { StatusPill, type PillTone } from "@/components/ds/status-pill";
import { Button } from "@/components/ds/button";
import { Avatar } from "@/components/ds/avatar";
import { SummaryBar } from "@/components/ds/summary-bar";
import { ProjectTimeline } from "@/components/ds/project-timeline";
import { ConversationProvider } from "@/components/ds/conversation-context";
import { ConversationPanel } from "@/components/ds/conversation-panel";
import { EmptyState } from "@/components/ds/empty-state";
import { StepCard, AgentWhy, STEP_PILL, type StepStatus } from "@/components/ops/cockpit/step-card";
import { EstimateEditor } from "@/components/ops/cockpit/estimate-editor";
import { BriefEditForm, DatesForm, RegenerateEstimateButton, UploadAssetForm } from "@/components/ops/cockpit/cockpit-forms";
import {
  addTeamMemberAction,
  confirmTeamAction,
  opsBatchApproveAction,
  opsReviewAssetAction,
  removeTeamMemberAction,
  sendEstimateAction,
  setAutopilotAction,
  staffNoteAction,
  staffReplyAction,
  swapTeamMemberAction,
  updateTeamMemberAction,
  viewAsClientAction,
} from "@/lib/actions/cockpit-actions";
import { acceptBriefAsIsAction, requestBriefFromClientAction, sendDeliveryToClientAction, sendSignOffReminderAction } from "@/lib/actions/ops-pipeline-actions";
import { cn, jsonArray } from "@/lib/utils";
import { DEMO_PERSONAS } from "@/lib/demo-personas";
import { prisma } from "@/lib/prisma";

type Edit = "brief" | "estimate" | "staffing" | "dates" | null;
type Search = { edit?: string; feed?: string };

const HEALTH_TEXT = { success: "text-ds-success-text", watch: "text-ds-watch-text", danger: "text-ds-danger-text" } as const;

function short(name: string) {
  const [first, last] = name.split(" ");
  return last && last.length > 2 ? `${first} ${last[0]}.` : name;
}

function lastRun(c: Cockpit, key: string) {
  return c.runs.find((r) => r.agent.key === key) ?? null;
}

function pmChanged(c: Cockpit, area: string) {
  return c.decisions.some((d) => d.area === area && d.actor);
}

export default async function CockpitPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Search> }) {
  const { projectId } = await params;
  const { edit: editParam, feed } = await searchParams;
  const viewer = await getOpsViewer();
  const tier = roleTierFor(viewer.title);
  const canEdit = tier === "ADMIN" || tier === "PM";
  const c = await loadCockpit(projectId);
  // Unstarted DRAFTs are the client's private work, never shown in ops.
  if (!c) notFound();
  scheduleAutopilot(projectId);

  const edit: Edit = canEdit && ["brief", "estimate", "staffing", "dates"].includes(editParam ?? "") ? (editParam as Edit) : null;
  const { project, ops } = c;
  const { state } = ops;
  const base = `/ops/projects/${projectId}`;
  const contact = c.contact;
  const persona = DEMO_PERSONAS.find((p) => p.email === contact?.user.email);
  const lead = project.client.accountLead?.user.name;
  const team = project.team?.members ?? [];
  const hours = team.reduce((n, m) => n + m.allocatedHours, 0) || project.estimate?.totalHours || 0;
  const credits = project.estimate?.totalCredits ?? project.creditsQuoted;

  const summary = [
    ...(project.dueDate ? [{ key: "due", label: "Due", value: formatDay(project.dueDate) }] : []),
    ...(credits !== null && credits !== undefined
      ? [
          {
            key: "credits",
            label: "Credits",
            value: (
              <>
                {credits}
                {hours > 0 && <span className="ml-1 text-[12px] font-medium text-ds-text-2">· ≈ {Math.round(hours)} h</span>}
              </>
            ),
          },
        ]
      : []),
    ...(lead ? [{ key: "lead", label: "Account lead", value: short(lead) }] : []),
    {
      key: "health",
      label: "Health",
      wide: true,
      value: (
        <span className={HEALTH_TEXT[c.health.tone]}>
          {c.health.label}
          {c.health.reason ? ` · ${c.health.reason}` : ""}
        </span>
      ),
    },
  ];

  const feedItems = activityFeed(c);
  const clientFirst = contact?.user.name.split(" ")[0] ?? "The client";

  return (
    <ConversationProvider defaultChannel={feed === "notes" || feed === "client" ? feed : "activity"}>
      <div className="flex min-h-full">
        <div className="@container/main min-w-0 flex-1 px-4 pb-24 pt-6 md:px-10 md:pb-12 md:pt-8">
          <div className="mx-auto flex max-w-[1040px] flex-col gap-5">
            <Link href="/ops/projects" className="inline-flex items-center gap-1.5 self-start text-[13px] text-ds-text-2 no-underline hover:text-ds-text">
              <ChevronLeft className="size-4" strokeWidth={1.75} />
              {project.client.name} · Projects
            </Link>

            {/* Header */}
            <Card aria-label="Project header">
              <div className="flex flex-col items-start gap-4 px-6 pb-5 pt-6 sm:flex-row">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="m-0 text-[28px] font-light leading-[1.2] tracking-[0.01em] text-ds-text min-[700px]:text-[32px]">{project.name}</h1>
                    <StatusPill>{state.paused ? "Paused" : INTERNAL_STAGE_PILL[state.stage]}</StatusPill>
                    <StatusPill tone={project.autopilot ? "success" : "watch"} dot>
                      {project.autopilot ? "Autopilot on" : "Autopilot paused"}
                    </StatusPill>
                  </div>
                  <div className="text-[13px] text-ds-text-2">
                    {[project.client.name, contact ? `${contact.user.name}${contact.jobTitle ? ` (${contact.jobTitle})` : ""}` : null, PROJECT_TYPE_LABEL[project.type]?.split(" / ")[0]]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canEdit && (
                    <form action={setAutopilotAction}>
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="on" value={project.autopilot ? "0" : "1"} />
                      <Button type="submit" variant="secondary" size="md">
                        {project.autopilot ? "Pause autopilot" : "Resume autopilot"}
                      </Button>
                    </form>
                  )}
                  {persona && (
                    <form action={viewAsClientAction}>
                      <input type="hidden" name="projectId" value={project.id} />
                      <Button type="submit" variant="secondary" size="md">
                        View as client
                      </Button>
                    </form>
                  )}
                </div>
              </div>
              <SummaryBar items={summary} />
              <div className="px-6 pb-6 pt-5">
                <ProjectTimeline steps={c.timeline} variant="internal" label="Internal pipeline" yourTurn={false} />
              </div>
            </Card>

            <BriefStep c={c} canEdit={canEdit} editing={edit === "brief"} base={base} />
            <EstimateStep c={c} canEdit={canEdit} editing={edit === "estimate"} base={base} clientFirst={clientFirst} />
            <StaffingStep c={c} canEdit={canEdit} editing={edit === "staffing"} base={base} />
            <DeliveryStep c={c} canEdit={canEdit} tier={tier} editingDates={edit === "dates"} base={base} />
          </div>
        </div>

        <ConversationPanel
          title="Project feed"
          projectId={project.id}
          storageKey={`klingit.ops-feed.${viewer.userId}`}
          participants={[]}
          footerNote={
            <>
              <Lock className="size-3" strokeWidth={2} />
              {project.client.name}&apos;s internal channel is private to {project.client.name}.
            </>
          }
          channels={[
            {
              key: "client",
              label: "Client",
              unread: ops.exceptions.some((e) => e.kind === "client_waiting") ? 1 : 0,
              hint: canEdit
                ? `Shared with ${contact?.user.name ?? "the client"} and ${project.client.name}. Replies are visible to the client.`
                : `Shared with ${project.client.name}. Only Admins and PMs reply here; use Staff notes.`,
              placeholder: `Reply to ${project.client.name}…`,
              messages: clientThread(c, viewer.userId),
              post: canEdit ? staffReplyAction : undefined,
            },
            {
              key: "notes",
              label: "Staff notes",
              unread: 0,
              hint: "Klingit staff only. Never shown to the client.",
              placeholder: "Note for the Klingit team…",
              messages: staffNotesThread(c),
              post: staffNoteAction,
            },
            {
              key: "activity",
              label: "Activity",
              unread: 0,
              hint: "Every agent decision and PM change on this project.",
              placeholder: "Add a staff note…",
              body: <ActivityTimeline items={feedItems} />,
              post: staffNoteAction,
            },
          ]}
        />
      </div>
    </ConversationProvider>
  );
}

// ─── Activity ──────────────────────────────────────────────────────────────

const TAG_TONE: Record<ActivityItem["tone"], string> = {
  pm: "bg-ds-text text-white",
  auto: "bg-ds-success-tint text-ds-success-text",
  agent: "bg-ds-info-tint text-ds-info-text",
  client: "bg-ds-danger-tint text-ds-danger-text",
  error: "bg-ds-danger-tint text-ds-danger-text",
};

function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) return <EmptyState title="No activity yet" description="Agent decisions and PM changes show up here." />;
  const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {items.map((e) => (
        <li key={e.id} className="flex gap-3 pb-[18px]">
          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-[8px] text-[10px] font-bold", TAG_TONE[e.tone])}>{e.tag}</span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[14px] font-medium text-ds-text">{e.title}</span>
            {e.detail && <span className="text-[13px] text-ds-text-2">{e.detail}</span>}
            <span className="text-[12px] text-ds-text-3">{fmt.format(e.at)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ─── Brief ─────────────────────────────────────────────────────────────────

function BriefStep({ c, canEdit, editing, base }: { c: Cockpit; canEdit: boolean; editing: boolean; base: string }) {
  const brief = c.project.brief;
  const stage = c.ops.state.stage;
  const accepted = brief?.status === "ACCEPTED";
  const status: StepStatus = accepted || stage !== "briefing" ? "done" : "current";
  const gaps = jsonArray<string>(brief?.gapsFlagged);
  const pills = [
    pmChanged(c, "brief") ? STEP_PILL.pm : accepted && (lastRun(c, "brief_agent") || c.decisions.some((d) => d.area === "autopilot" && d.action === "Accepted the brief")) ? STEP_PILL.agent : null,
    !accepted && stage === "briefing" && brief?.status === "SUBMITTED" && (!c.project.autopilot || gaps.length > 0) ? STEP_PILL.needs : null,
  ].filter(Boolean) as { label: string; tone: PillTone }[];
  const summary = !brief
    ? "The client hasn't started the brief."
    : accepted
      ? `Complete, ${gaps.length} gap${gaps.length === 1 ? "" : "s"}.${brief.aiSummary ? ` ${brief.aiSummary}` : ""}`
      : brief.status === "GAPS_FLAGGED"
        ? `Waiting on the client: ${gaps.join(" · ") || "more detail"}.`
        : brief.status === "SUBMITTED"
          ? gaps.length
            ? `${gaps.length} gap${gaps.length === 1 ? "" : "s"}: ${gaps.join(" · ")}`
            : "Ready to accept: 0 gaps."
          : "The client is still answering the brief agent's questions.";

  return (
    <StepCard
      id="brief"
      title="Brief"
      status={status}
      pills={pills}
      summary={summary}
      why={lastRun(c, "brief_agent") ? <AgentWhy run={lastRun(c, "brief_agent")} /> : undefined}
      editHref={canEdit && brief ? `${base}?edit=brief#brief` : undefined}
      editing={editing}
      actions={
        canEdit && brief && brief.status === "SUBMITTED" && !editing ? (
          <>
            <form action={requestBriefFromClientAction}>
              <input type="hidden" name="briefId" value={brief.id} />
              <input type="hidden" name="clientId" value={c.project.clientId} />
              <Button type="submit" variant="ghost" size="sm">
                Ask the client
              </Button>
            </form>
            <form action={acceptBriefAsIsAction}>
              <input type="hidden" name="briefId" value={brief.id} />
              <input type="hidden" name="clientId" value={c.project.clientId} />
              <Button type="submit" variant="secondary" size="sm">
                Accept as-is
              </Button>
            </form>
          </>
        ) : undefined
      }
    >
      {editing && brief && (
        <BriefEditForm
          projectId={c.project.id}
          cancelHref={`${base}#brief`}
          brief={{ goals: brief.goals, targetAudience: brief.targetAudience, successMetrics: brief.successMetrics, references: brief.references, deliverablesNotes: brief.deliverablesNotes }}
        />
      )}
    </StepCard>
  );
}

// ─── Estimate ──────────────────────────────────────────────────────────────

function EstimateStep({ c, canEdit, editing, base, clientFirst }: { c: Cockpit; canEdit: boolean; editing: boolean; base: string; clientFirst: string }) {
  const est = c.project.estimate;
  const stage = c.ops.state.stage;
  const status: StepStatus = est?.status === "APPROVED" && est.approvedVersion ? "done" : ["estimating", "awaiting_approval"].includes(stage) ? "current" : est ? "done" : "upcoming";
  const open = c.unresolved.filter((n) => !n.resolution);
  const blocked = c.ops.plan.blocked.find((b) => b.kind === "estimate_needs_pm");
  const clientHasVersion = Boolean(est && est.status !== "DRAFT");
  const latest = est?.revisions[0];
  const pills: { label: string; tone: PillTone }[] = [];
  if (est) {
    if (pmChanged(c, "estimate")) pills.push(STEP_PILL.pm);
    else if (lastRun(c, "estimate_agent")) pills.push(STEP_PILL.priced);
    if (est.status === "APPROVED" && est.revisions.length === 0) pills.push({ label: `v${est.version} approved`, tone: "success" });
    else if (est.status === "DRAFT") pills.push({ label: `v${est.version} draft`, tone: "neutral" });
    else if (latest) pills.push({ label: `v${latest.version} ${latest.status === "SENT" ? "sent" : latest.status.toLowerCase()} ${shortDate(latest.createdAt)}`, tone: "neutral" });
    if (editing && clientHasVersion) pills.push({ label: `Editing v${est.version + 1}`, tone: "neutral" });
    if (open.length || (est.status === "DRAFT" && blocked)) pills.push(STEP_PILL.needs);
  }
  const summary = !est
    ? stage === "estimating"
      ? "The Estimate agent prices the brief from the price list."
      : "Priced once the brief is accepted."
    : est.status === "DRAFT" && blocked
      ? blocked.reason
      : est.status === "DRAFT"
        ? c.project.autopilot
          ? `Every line is from the price list and it's under ${AUTO_SEND_CREDIT_CAP} credits, so autopilot sends it.`
          : "Autopilot is paused. Check it and send it yourself."
        : est.status === "CHANGES_REQUESTED"
          ? "The client asked for changes. Edit and send a new version."
          : "Every line is looked up from the price list. Credit math happens on the server.";

  return (
    <StepCard
      id="estimate"
      title="Estimate"
      status={status}
      pills={pills}
      summary={summary}
      why={lastRun(c, "estimate_agent") ? <AgentWhy run={lastRun(c, "estimate_agent")} /> : undefined}
      editHref={canEdit && est ? `${base}?edit=estimate#estimate` : undefined}
      editing={editing}
      actions={
        canEdit && !editing ? (
          <>
            {(!est || est.status === "DRAFT") && stage === "estimating" && <RegenerateEstimateButton projectId={c.project.id} />}
            {est?.status === "DRAFT" && open.length === 0 && (
              <form action={sendEstimateAction}>
                <input type="hidden" name="projectId" value={c.project.id} />
                <Button type="submit" variant="primary" size="sm">
                  Send to client
                </Button>
              </form>
            )}
          </>
        ) : undefined
      }
    >
      {est && editing && (
        <EstimateEditor
          projectId={c.project.id}
          cancelHref={`${base}#estimate`}
          clientHasVersion={clientHasVersion}
          clientFirstName={clientFirst}
          version={est.version}
          priceList={c.priceList.map((p) => ({ deliverableType: p.deliverableType, complexityTier: p.complexityTier, creditCost: p.creditCost, displayName: p.displayName }))}
          needs={c.unresolved.map((n) => ({ description: n.description, reason: n.reason, resolved: Boolean(n.resolution) }))}
          lines={est.lineItems.map((l) => ({
            id: l.id,
            deliverable: l.deliverable,
            detail: l.detail,
            quantity: l.quantity,
            complexityTier: l.complexityTier,
            credits: l.credits,
            isCustom: l.isCustom,
            customReason: l.customReason,
            priceListItemId: l.priceListItemId,
          }))}
        />
      )}
      {est && !editing && (
        <div className="flex flex-col gap-3 px-6 pb-[18px] pt-3.5">
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-[14px] text-ds-text-body">
            {est.lineItems.map((l) => (
              <span key={l.id}>
                {lineName(l)} · {l.quantity}
                {l.complexityTier ? ` · ${COMPLEXITY_LABEL[l.complexityTier]}` : ""} · {l.credits}
                {l.isCustom && <span className="text-ds-text-3"> (custom)</span>}
              </span>
            ))}
            <span className="font-semibold text-ds-text">Total {est.totalCredits}</span>
          </div>
          {open.length > 0 && (
            <div className="rounded-[8px] bg-ds-watch-tint px-3 py-2 text-[13px] text-ds-watch-text">
              Out of scope: {open.map((n) => n.description).join(", ")}. Price them or exclude them in Edit.
            </div>
          )}
          {est.revisions.length > 1 && (
            <div className="flex flex-wrap gap-2 text-[12px] text-ds-text-2">
              {est.revisions.map((r) => (
                <span key={r.id}>
                  v{r.version} · {r.status.toLowerCase()} · {r.totalCredits} credits{r.reason ? ` · “${r.reason}”` : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </StepCard>
  );
}

// ─── Staffing ──────────────────────────────────────────────────────────────

const AVAILABLE_TEXT = (s: { availableHours: number; capacityHoursPerWeek: number }) =>
  s.availableHours >= s.capacityHoursPerWeek * 0.5 ? "free now" : s.availableHours > 0 ? `${Math.round(s.availableHours)} h free` : "fully booked";

function StaffingStep({ c, canEdit, editing, base }: { c: Cockpit; canEdit: boolean; editing: boolean; base: string }) {
  const stage = c.ops.state.stage;
  const team = c.project.team;
  const members = team?.members ?? [];
  const confirmed = Boolean(team?.confirmed);
  const status: StepStatus = confirmed ? "done" : stage === "staffing" ? "current" : "upcoming";
  const blocked = c.ops.plan.blocked.find((b) => b.kind === "staffing_needs_pm");
  const autoStaffed = c.decisions.some((d) => d.area === "autopilot" && d.action.startsWith("Staffed"));
  const pills = [
    pmChanged(c, "staffing") ? STEP_PILL.pm : confirmed && autoStaffed ? STEP_PILL.agent : null,
    !confirmed && ["estimating", "awaiting_approval"].includes(stage) && c.project.autopilot ? STEP_PILL.auto : null,
    blocked || (stage === "staffing" && !c.project.autopilot && !confirmed) ? STEP_PILL.needs : null,
  ].filter(Boolean) as { label: string; tone: PillTone }[];
  const memberIds = new Set(members.map((m) => m.staffMemberId));
  const candidates = c.suggestions.filter((s) => !memberIds.has(s.staffMemberId));
  const summary = confirmed
    ? `${members.map((m) => `${short(m.staffMember.user.name)} (${m.roleOnProject.toLowerCase()})`).join(", ")} · confirmed ${team?.confirmedAt ? shortDate(team.confirmedAt) : ""}`
    : blocked
      ? blocked.reason
      : `Top matches right now. Auto-confirms if the best match for each role scores ${c.autoStaffThreshold} or more.`;

  return (
    <StepCard
      id="staffing"
      title="Staffing"
      status={status}
      pills={pills}
      summary={summary}
      why={lastRun(c, "staffing_agent") ? <AgentWhy run={lastRun(c, "staffing_agent")} /> : undefined}
      editHref={canEdit ? `${base}?edit=staffing#staffing` : undefined}
      editing={editing}
      actions={
        canEdit && !confirmed && members.length > 0 && stage === "staffing" ? (
          <form action={confirmTeamAction}>
            <input type="hidden" name="projectId" value={c.project.id} />
            <Button type="submit" variant="primary" size="sm">
              Confirm team
            </Button>
          </form>
        ) : undefined
      }
    >
      {(members.length > 0 || editing) && (
        <ul className="m-0 list-none p-0">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 border-b border-ds-divider px-6 py-3">
              <Avatar name={m.staffMember.user.name} size={32} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[14px] font-medium text-ds-text">{m.staffMember.user.name}</span>
                <span className="text-[12px] text-ds-text-2">
                  {m.roleOnProject} · {m.allocatedHours} h
                </span>
              </div>
              {editing && (
                <div className="flex flex-wrap items-center gap-2">
                  <form action={updateTeamMemberAction} className="flex items-center gap-2">
                    <input type="hidden" name="projectId" value={c.project.id} />
                    <input type="hidden" name="teamMemberId" value={m.id} />
                    <input aria-label="Role" name="role" defaultValue={m.roleOnProject} className="h-8 w-[140px] rounded-[8px] border border-ds-control-border px-2.5 text-[13px]" />
                    <input aria-label="Hours" name="hours" type="number" min={0} step={0.5} defaultValue={m.allocatedHours} className="h-8 w-[72px] rounded-[8px] border border-ds-control-border px-2.5 text-[13px]" />
                    <Button type="submit" variant="ghost" size="sm">
                      Save
                    </Button>
                  </form>
                  <form action={swapTeamMemberAction} className="flex items-center gap-2">
                    <input type="hidden" name="projectId" value={c.project.id} />
                    <input type="hidden" name="teamMemberId" value={m.id} />
                    <select aria-label={`Swap ${m.staffMember.user.name} for`} name="staffMemberId" className="h-8 rounded-[8px] border border-ds-control-border bg-white px-2 text-[13px]" defaultValue="">
                      <option value="" disabled>
                        Swap for…
                      </option>
                      {candidates.map((s) => (
                        <option key={s.staffMemberId} value={s.staffMemberId}>
                          {s.name} · {INTERNAL_ROLE_LABEL[s.title]} · {s.overallScore}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" variant="ghost" size="sm">
                      Swap
                    </Button>
                  </form>
                  <form action={removeTeamMemberAction}>
                    <input type="hidden" name="projectId" value={c.project.id} />
                    <input type="hidden" name="teamMemberId" value={m.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Remove
                    </Button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {(!confirmed || editing) && (
        <div className={cn("grid grid-cols-1", editing ? "" : "sm:grid-cols-3")}>
          {(editing ? candidates : candidates.slice(0, 3)).map((s, i) => (
            <div
              key={s.staffMemberId}
              className={cn(
                "flex items-center gap-3 px-6 py-4",
                editing ? "border-b border-ds-divider" : i < 2 && "sm:border-r sm:border-ds-divider"
              )}
            >
              <Avatar name={s.name} size={36} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[14px] font-medium text-ds-text">{short(s.name)}</span>
                <span className="text-[12px] text-ds-text-2">
                  {INTERNAL_ROLE_LABEL[s.title]} · {AVAILABLE_TEXT(s)}
                  {editing && ` · skills ${s.skillMatchPct}%${s.workedWithClientBefore ? " · worked with client" : ""}`}
                </span>
              </div>
              <span className={cn("text-[15px] font-semibold tabular-nums", s.overallScore < c.autoStaffThreshold ? "text-ds-watch-text" : "text-ds-text")}>{s.overallScore}</span>
              {editing && (
                <form action={addTeamMemberAction} className="flex items-center gap-2">
                  <input type="hidden" name="projectId" value={c.project.id} />
                  <input type="hidden" name="staffMemberId" value={s.staffMemberId} />
                  <input type="hidden" name="role" value={INTERNAL_ROLE_LABEL[s.title]} />
                  <input aria-label={`Hours for ${s.name}`} name="hours" type="number" min={0} step={0.5} defaultValue={8} className="h-8 w-[64px] rounded-[8px] border border-ds-control-border px-2 text-[13px]" />
                  <Button type="submit" variant="secondary" size="sm">
                    Add
                  </Button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && (
        <div className="flex items-center gap-2 px-6 py-3">
          <span className="min-w-0 flex-1 text-[12px] text-ds-text-2">
            Changes after confirmation restart the first-draft clock and tell the client. Role and hours edits don&apos;t.
          </span>
          <Button asChild variant="secondary" size="md">
            <Link href={`${base}#staffing`} scroll={false}>
              Done
            </Link>
          </Button>
        </div>
      )}
    </StepCard>
  );
}

// ─── Production · Review · Delivery ────────────────────────────────────────

const ASSET_PILL: Record<string, { label: string; tone: PillTone }> = {
  IN_REVIEW: { label: "In QA", tone: "neutral" },
  APPROVED: { label: "Approved", tone: "success" },
  CHANGES_REQUESTED: { label: "Revision", tone: "changes" },
  DELIVERED: { label: "Delivered", tone: "success" },
};

const ETA_LABEL = [
  { name: "PRODUCTION", label: "Production ETA" },
  { name: "FIRST_DRAFT_DELIVERY", label: "First draft ETA" },
  { name: "FEEDBACK", label: "Review ETA" },
  { name: "FINAL_DELIVERY", label: "Final delivery ETA" },
];

async function DeliveryStep({ c, canEdit, tier, editingDates, base }: { c: Cockpit; canEdit: boolean; tier: string; editingDates: boolean; base: string }) {
  const { project } = c;
  const stage = c.ops.state.stage;
  const clientReviewing = project.status === "AWAITING_REVIEW";
  const inProduction = project.status === "IN_PRODUCTION" || project.status === "QA";
  const eta = (name: string) => project.pipelineStages.find((s) => s.name === name)?.etaAt ?? null;
  const assets = project.assets.filter((a) => a.status !== "ARCHIVED");
  const counts = { qa: assets.filter((a) => a.status === "IN_REVIEW").length, approved: assets.filter((a) => a.status === "APPROVED").length, revise: assets.filter((a) => a.status === "CHANGES_REQUESTED").length };
  const firstDraft = c.ops.state.keyFacts.firstDraftEta;
  const rows = [
    {
      name: "Production",
      status: (["production"].includes(stage) ? "current" : ["review", "final", "closed"].includes(stage) ? "done" : "upcoming") as StepStatus,
      detail: inProduction
        ? `${assets.length} asset${assets.length === 1 ? "" : "s"} · ${counts.qa} in QA · ${counts.approved} approved${counts.revise ? ` · ${counts.revise} in revision` : ""}. No agent produces work today: the team uploads it.`
        : `First draft due ${2} business days after the team is confirmed.`,
      when: firstDraft ? `Draft ${shortDate(firstDraft)}` : project.team?.confirmed ? "Now" : "After staffing",
    },
    {
      name: "Review",
      status: (stage === "review" ? "current" : ["final", "closed"].includes(stage) ? "done" : "upcoming") as StepStatus,
      detail: clientReviewing ? `The client is reviewing ${counts.qa} asset${counts.qa === 1 ? "" : "s"}.` : "The client reviews and comments on each asset. 2 rounds included.",
      when: eta("FEEDBACK") ? `Est. ${shortDate(eta("FEEDBACK")!)}` : "After the first draft",
    },
    {
      name: "Delivery",
      status: (stage === "final" ? "current" : stage === "closed" ? "done" : "upcoming") as StepStatus,
      detail: stage === "final" ? "Everything is approved. Waiting for the client to sign off." : "The final package goes to the client to sign off.",
      when: project.dueDate ? `Due ${shortDate(project.dueDate)}` : "No due date",
    },
  ];
  const comments = await prisma.comment.groupBy({ by: ["assetId"], where: { projectId: project.id, assetId: { not: null }, archivedAt: null }, _count: true });
  const commentCount = (id: string) => comments.find((x) => x.assetId === id)?._count ?? 0;

  return (
    <section id="production" aria-label="Production, review and delivery" className={cn("scroll-mt-6 overflow-hidden rounded-[12px] border bg-ds-card", editingDates ? "border-ds-text shadow-[0_4px_16px_rgba(16,24,40,0.08)]" : "border-ds-border shadow-ds")}>
      {rows.map((r, i) => (
        <div key={r.name} className={cn("flex flex-wrap items-center gap-4 px-6 py-4", i > 0 && "border-t border-ds-divider")}>
          <span
            aria-hidden
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full",
              r.status === "done" && "bg-ds-text",
              r.status === "current" && "border-2 border-ds-text",
              r.status === "upcoming" && "border-2 border-ds-control-border"
            )}
          >
            {r.status === "current" && <span className="size-2 rounded-full bg-ds-text" />}
            {r.status === "done" && <span className="size-2 rounded-full bg-white" />}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[14px] font-semibold text-ds-text">{r.name}</span>
            <span className="text-[14px] text-ds-text-2">{r.detail}</span>
          </div>
          <span className="text-[12px] text-ds-text-3">{r.when}</span>
          {canEdit && !editingDates && (
            <Button asChild variant="ghost" size="sm">
              <Link href={`${base}?edit=dates#production`} scroll={false}>
                Edit dates
              </Link>
            </Button>
          )}
        </div>
      ))}

      {editingDates && (
        <div className="border-t border-ds-divider">
          <DatesForm
            projectId={project.id}
            dueDate={project.dueDate}
            cancelHref={`${base}#production`}
            etas={ETA_LABEL.map((e) => ({ ...e, etaAt: eta(e.name) }))}
          />
        </div>
      )}

      {/* Assets: upload (Admin, PM, Creator), Klingit QA per asset, batch approve, send to the client. */}
      <div className="flex flex-col gap-4 border-t border-ds-divider px-6 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="m-0 flex-1 text-[15px] font-semibold text-ds-text">Assets</h3>
          {canEdit && inProduction && counts.qa >= 2 && (
            <form action={opsBatchApproveAction}>
              <input type="hidden" name="projectId" value={project.id} />
              <Button type="submit" variant="secondary" size="sm">
                Approve {counts.qa} in QA
              </Button>
            </form>
          )}
          {canEdit && inProduction && counts.approved > 0 && counts.qa === 0 && (
            <form action={sendDeliveryToClientAction}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="clientId" value={project.clientId} />
              <Button type="submit" variant="primary" size="sm">
                Send {project.deliveredAt ? "the revision" : "first draft"} to client
              </Button>
            </form>
          )}
          {canEdit && clientReviewing && counts.revise > 0 && (
            <form action={sendDeliveryToClientAction}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="clientId" value={project.clientId} />
              <Button type="submit" variant="secondary" size="sm">
                Send revisions to client
              </Button>
            </form>
          )}
          {canEdit && stage === "final" && (
            <form action={sendSignOffReminderAction}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="clientId" value={project.clientId} />
              <Button type="submit" variant="secondary" size="sm">
                Remind client to sign off
              </Button>
            </form>
          )}
        </div>
        {assets.length === 0 ? (
          <p className="m-0 text-[14px] text-ds-text-2">
            {["production", "review", "final"].includes(stage) ? "No assets yet. Upload the first draft files below." : "Assets are uploaded here once the team is confirmed."}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {assets.map((a) => {
              const pill = clientReviewing && a.status === "IN_REVIEW" ? { label: "With client", tone: "turn" as PillTone } : (ASSET_PILL[a.status] ?? ASSET_PILL.IN_REVIEW);
              return (
                <li key={a.id} id={`asset-${a.id}`} className="flex items-center gap-3 rounded-[10px] border border-ds-divider p-2.5">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-[8px]" style={{ backgroundColor: `color-mix(in srgb, ${a.thumbnailColor} 16%, white)` }}>
                    {a.type === "VIDEO" ? <Play className="size-4 text-ds-text/40" strokeWidth={1.5} /> : <ImageIcon className="size-4 text-ds-text/40" strokeWidth={1.5} />}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[14px] font-medium text-ds-text">{assetTitle(a.name, a.format)}</span>
                    <span className="text-[12px] text-ds-text-2">
                      {formatLabel(a.format)} · v{a.version}
                      {commentCount(a.id) ? ` · ${commentCount(a.id)} comment${commentCount(a.id) === 1 ? "" : "s"}` : ""}
                      {a.changeRequestCount > 0 ? ` · ${a.changeRequestCount}× changes asked` : ""}
                    </span>
                  </div>
                  <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                  <Button asChild variant="ghost" size="icon" aria-label={`Download ${a.name}`}>
                    <a href={`/api/assets/${a.id}/download`} download>
                      <Download strokeWidth={1.75} />
                    </a>
                  </Button>
                  {canEdit && inProduction && a.status !== "APPROVED" && (
                    <form action={opsReviewAssetAction}>
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="assetId" value={a.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <Button type="submit" variant="secondary" size="sm">
                        Approve
                      </Button>
                    </form>
                  )}
                  {canEdit && inProduction && a.status !== "CHANGES_REQUESTED" && (
                    <form action={opsReviewAssetAction}>
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="assetId" value={a.id} />
                      <input type="hidden" name="decision" value="revise" />
                      <Button type="submit" variant="ghost" size="sm">
                        Request revision
                      </Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {(tier === "ADMIN" || tier === "PM" || tier === "CREATOR") && ["production", "review", "final"].includes(stage) && <UploadAssetForm projectId={project.id} />}
      </div>
    </section>
  );
}
