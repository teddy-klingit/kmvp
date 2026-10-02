import { Card } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { AvatarStack } from "@/components/ds/avatar";
import { SummaryBar, type SummaryItem } from "@/components/ds/summary-bar";
import { ProjectTimeline } from "@/components/ds/project-timeline";
import { PROJECT_TYPE_LABEL } from "@/lib/labels";
import {
  clientMilestones,
  clientStatusPill,
  formatDay,
  shortDate,
  FIRST_DRAFT_BUSINESS_DAYS,
  type ProjectState,
} from "@/lib/project-state";

type HeaderProject = { name: string; type: string; startedAt: Date | null; createdAt: Date; deliveredAt: Date | null; confidential: boolean };

function firstName(name: string) {
  return name.split(" ")[0];
}

function summaryItems(state: ProjectState, assets: { total: number; approved: number }): SummaryItem[] {
  const { keyFacts, stage } = state;
  const items: SummaryItem[] = [];
  if (keyFacts.dueDate) items.push({ key: "due", label: "Due", value: formatDay(keyFacts.dueDate) });
  if (keyFacts.credits !== undefined) items.push({ key: "credits", label: "Credits", value: String(keyFacts.credits) });

  if ((stage === "review" || stage === "final") && assets.total > 0) {
    items.push({ key: "review", label: "Review", value: `${assets.approved} of ${assets.total} approved` });
  } else if (keyFacts.firstDraftEta) {
    items.push({ key: "draft", label: "First draft", value: formatDay(keyFacts.firstDraftEta) });
  } else if (stage === "estimating" || stage === "awaiting_approval") {
    items.push({ key: "draft", label: "First draft", value: `≤ ${FIRST_DRAFT_BUSINESS_DAYS} days after OK` });
  } else if (stage === "staffing") {
    items.push({ key: "draft", label: "First draft", value: `≤ ${FIRST_DRAFT_BUSINESS_DAYS} days after staffing` });
  }

  const team = keyFacts.staffedTeam;
  if (team.length > 0) {
    items.push({
      key: "team",
      label: "Klingit team",
      wide: true,
      leading: <AvatarStack names={team.map((m) => m.name)} size={30} />,
      value: (
        <span>
          {team.slice(0, 2).map((m) => firstName(m.name)).join(", ")}
          {team.length > 2 ? ` +${team.length - 2}` : ""}
        </span>
      ),
    });
  } else if (stage === "estimating" || stage === "awaiting_approval") {
    items.push({
      key: "team",
      label: "Klingit team",
      wide: true,
      value: <span className="font-medium text-ds-text-2">Assigned on approval</span>,
    });
  } else if (stage === "staffing") {
    items.push({ key: "team", label: "Klingit team", wide: true, value: <span className="font-medium text-ds-text-2">Being staffed</span> });
  }
  return items;
}

export function ProjectHeaderCard({
  project,
  state,
  assets,
  share,
}: {
  project: HeaderProject;
  state: ProjectState;
  assets: { total: number; approved: number };
  share: React.ReactNode;
}) {
  const pill = clientStatusPill(state);
  const started = project.startedAt ?? project.createdAt;
  const meta = [
    PROJECT_TYPE_LABEL[project.type]?.split(" / ")[0],
    assets.total > 0 ? `${assets.total} asset${assets.total === 1 ? "" : "s"}` : null,
    state.draft ? `Created ${shortDate(started)}` : `Started ${shortDate(started)}`,
    project.confidential ? "Confidential" : null,
  ].filter(Boolean);

  return (
    <Card aria-label="Project header">
      <div className="flex flex-col items-start gap-4 px-5 pb-5 pt-5 sm:flex-row sm:px-6 sm:pt-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 text-[28px] font-light leading-[1.2] tracking-[0.01em] text-ds-text min-[700px]:text-[32px]">{project.name}</h1>
            <StatusPill tone={pill.tone} dot>
              {pill.label}
            </StatusPill>
          </div>
          <div className="text-[13px] text-ds-text-2">{meta.join(" · ")}</div>
        </div>
        {share}
      </div>
      <SummaryBar items={summaryItems(state, assets)} />
      {!state.archived && (
        <div className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
          <ProjectTimeline steps={clientMilestones(state)} yourTurn={state.ballInCourt === "client" && !state.paused} />
        </div>
      )}
    </Card>
  );
}
