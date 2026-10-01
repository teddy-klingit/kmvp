import Link from "next/link";
import { Check, FileText, Link2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { StatusPill } from "@/components/ds/status-pill";
import { AskButton } from "@/components/ds/ask-button";
import { jsonArray } from "@/lib/utils";
import { answerBriefQuestionAction, answerDynamicBriefQuestionAction, startProjectAction } from "@/lib/actions/project-actions";
import { getEffectiveBriefQuestions } from "@/lib/brief-questions";
import { BriefIntakeForm } from "@/components/portal/brief-intake-form";
import { AnswerChips } from "@/components/portal/answer-chips";
import type { PortalViewer } from "@/lib/brief-intake";
import type { ProjectState } from "@/lib/project-state";

type TranscriptTurn = { key?: string; question: string; answer: string };

const LAST_QUESTION_THINKING = [
  "Reviewing your full brief…",
  "Checking it against your Brand OS…",
  "Weighing what's missing…",
  "Almost done…",
];

/**
 * The brief agent conversation, answered inline on Overview while the project
 * is briefing: free-text intake, then the agent's questions (chips + free text),
 * then the "ready / submitted" card.
 */
export async function BriefConversation({
  projectId: id,
  viewer,
  state,
}: {
  projectId: string;
  viewer: PortalViewer;
  state: ProjectState;
}) {
  const brief =
    (await prisma.brief.findFirst({ where: { projectId: id, project: { clientId: viewer.clientId } } })) ??
    (await prisma.brief.create({ data: { projectId: id, status: "DRAFT" } }));
  const progress = state.brief;

  if (progress.mode === "intake") {
    return <BriefIntakeForm projectId={id} />;
  }

  const transcript = jsonArray<TranscriptTurn>(brief.transcript);
  const fixedAnswers =
    progress.mode === "fixed"
      ? getEffectiveBriefQuestions(await prisma.brandOS.findUnique({ where: { clientId: viewer.clientId } }))
          .map((q) => ({ question: q.question, answer: (brief as Record<string, unknown>)[q.key] as string | null }))
          .filter((q): q is { question: string; answer: string } => Boolean(q.answer))
      : [];
  const answered = progress.mode === "dynamic" ? transcript : fixedAnswers;
  const next = progress.next;
  const lastQuestion = progress.total - progress.answered === 1;

  return (
    <div className="flex flex-col gap-5">
      {next ? (
        <Card aria-label="Brief agent question">
          <CardHeader
            title="Brief agent asks"
            meta={
              <StatusPill tone="turn">
                Question {progress.answered + 1} of {progress.total}
              </StatusPill>
            }
          />
          <CardBody className="flex flex-col gap-4">
            <p className="text-[16px] font-semibold text-ds-text">{next.question}</p>
            <AnswerChips
              action={progress.mode === "dynamic" ? answerDynamicBriefQuestionAction : answerBriefQuestionAction}
              hidden={{ briefId: brief.id, key: next.key }}
              quickAnswers={next.quickAnswers}
              customPlaceholder={next.placeholder ? `Or type your own — ${next.placeholder}` : "Or type your own answer"}
              thinkingLabel={lastQuestion ? LAST_QUESTION_THINKING : "Thinking of what to ask next…"}
            />
          </CardBody>
        </Card>
      ) : (
        <BriefReadyCard
          projectId={id}
          state={state}
          summary={brief.aiSummary}
          readiness={brief.aiQualityScore}
          gaps={jsonArray<string>(brief.gapsFlagged)}
        />
      )}

      <Card aria-label="Your brief so far">
        <CardHeader
          title="Your brief so far"
          action={
            <Link href={`/projects/${id}/scope`} className="text-[13px] font-medium text-ds-text no-underline hover:underline">
              View full brief
            </Link>
          }
        />
        <div className="divide-y divide-ds-divider">
          {brief.rawIntake && (
            <div className="flex items-start gap-3 px-6 py-4">
              <FileText className="mt-0.5 size-4 shrink-0 text-ds-text-2" strokeWidth={1.75} />
              <div className="min-w-0">
                <p className="text-[13px] text-ds-text-2">What you told us</p>
                <p className="text-[14px] text-ds-text">{brief.rawIntake}</p>
                {(brief.sourceLink || brief.sourceFileName) && (
                  <p className="mt-1 flex items-center gap-1 text-[12px] text-ds-text-2">
                    <Link2 className="size-3" />
                    {[brief.sourceLink, brief.sourceFileName].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </div>
          )}
          {answered.map((t, i) => (
            <div key={i} className="flex items-start gap-3 px-6 py-4">
              <Check className="mt-0.5 size-4 shrink-0 text-ds-check" strokeWidth={2} />
              <div className="min-w-0">
                <p className="text-[13px] text-ds-text-2">{t.question}</p>
                <p className="text-[14px] text-ds-text">{t.answer}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function BriefReadyCard({
  projectId,
  state,
  summary,
  readiness,
  gaps,
}: {
  projectId: string;
  state: ProjectState;
  summary: string | null;
  readiness: number | null;
  gaps: string[];
}) {
  return (
    <Card aria-label="Brief ready">
      <CardHeader
        title={state.draft ? "Your brief is ready" : "Brief submitted"}
        meta={readiness !== null ? <StatusPill>Readiness {readiness}/100</StatusPill> : undefined}
      />
      <CardBody className="flex flex-col gap-4">
        {summary && <p className="text-[14px] text-ds-text">{summary}</p>}
        {gaps.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px] text-ds-text-body">
            {gaps.map((g) => (
              <li key={g}>· {g}</li>
            ))}
          </ul>
        )}
        <p className="text-[13px] text-ds-text-2">
          {state.draft
            ? "Saved automatically. Nothing is sent to Klingit until you start the project."
            : state.nextAction.description}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <AskButton size="md" context={{ kind: "brief", label: "On the brief" }}>
            Ask a question
          </AskButton>
          {state.draft && (
            <form action={startProjectAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <Button type="submit" variant="primary" size="md">
                Start project
              </Button>
            </form>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
