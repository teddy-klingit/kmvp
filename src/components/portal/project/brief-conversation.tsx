import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, FileText, Link2, ArrowRight } from "lucide-react";
import { cn, jsonArray } from "@/lib/utils";
import {
  answerBriefQuestionAction,
  answerDynamicBriefQuestionAction,
  postCommentAction,
  startProjectAction,
} from "@/lib/actions/project-actions";
import { getEffectiveBriefQuestions } from "@/lib/brief-questions";
import { BriefIntakeForm } from "@/components/portal/brief-intake-form";
import { AnswerChips } from "@/components/portal/answer-chips";
import { CollapsibleGaps } from "@/components/portal/collapsible-gaps";
import { SuggestedReplyChips } from "@/components/portal/suggested-reply-chips";
import { CommentComposer } from "@/components/portal/comment-composer";
import type { PortalViewer } from "@/lib/brief-intake";
import type { ProjectState } from "@/lib/project-state";

type TranscriptTurn = { key?: string; question: string; answer: string };

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
  const isDraftProject = state.draft;

  const progress = state.brief;
  const transcript = jsonArray<TranscriptTurn>(brief.transcript);

  // ---- State 1: nothing yet — free-text/link/file intake ----
  if (progress.mode === "intake") {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-base font-semibold">Your brief</h2>
          <p className="text-sm text-muted-foreground">
            Tell us what you need in your own words — Klingit will structure it and ask what&apos;s missing.
          </p>
        </div>
        <BriefIntakeForm projectId={id} />
      </div>
    );
  }

  // ---- State 2: new-style dynamic Q&A ----
  if (progress.mode === "dynamic") {
    const nextQuestion = progress.next;
    const complete = !nextQuestion;
    const isLastQuestion = progress.total - progress.answered === 1;

    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-base font-semibold">Your brief</h2>
          <p className="text-sm text-muted-foreground">A few quick questions and this is ready for the team.</p>
        </div>

        <Card className="flex items-start gap-3 p-5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <FileText className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">What you told us</p>
            <p className="text-sm text-muted-foreground">{brief.rawIntake}</p>
            {(brief.sourceLink || brief.sourceFileName) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {brief.sourceLink && (
                  <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    <Link2 className="size-3" />
                    {brief.sourceLink}
                  </span>
                )}
                {brief.sourceFileName && (
                  <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    <FileText className="size-3" />
                    {brief.sourceFileName}
                  </span>
                )}
              </div>
            )}
          </div>
        </Card>

        {transcript.length > 0 && (
          <Card className="divide-y divide-border p-0">
            {transcript.map((t, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3.5">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border-2 border-success bg-success text-ink">
                  <Check className="size-2.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t.question}</p>
                  <p className="truncate text-sm text-foreground">{t.answer}</p>
                </div>
              </div>
            ))}
          </Card>
        )}

        {complete ? (
          <BriefCompleteCard
            brief={brief}
            projectId={id}
            ctaLabel={isDraftProject ? "Start project" : "View project overview"}
            isDraft={isDraftProject}
            state={state}
          />
        ) : (
          <>
            <Card className="flex animate-in fade-in slide-in-from-bottom-1 items-start gap-3 p-5 duration-200">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-ink">
                AI
              </span>
              <div>
                <p className="text-sm">{nextQuestion.question}</p>
                <p className="mt-0.5 text-xs font-medium text-ink">Brief agent</p>
              </div>
            </Card>

            <AnswerChips
              action={answerDynamicBriefQuestionAction}
              hidden={{ briefId: brief.id, key: nextQuestion.key }}
              quickAnswers={nextQuestion.quickAnswers}
              thinkingLabel={
                isLastQuestion
                  ? [
                      "Reviewing your full brief…",
                      "Checking it against your Brand IQ…",
                      "Weighing what's missing…",
                      "Almost done…",
                    ]
                  : "Thinking of what to ask next…"
              }
            />
            <PersistentBriefChat projectId={id} />
          </>
        )}
      </div>
    );
  }

  // ---- State 3: legacy fixed 4-question flow (pre-existing briefs) ----
  const answers: Record<string, string | null> = {
    goals: brief.goals,
    targetAudience: brief.targetAudience,
    successMetrics: brief.successMetrics,
    references: brief.references,
  };
  const brandOS = await prisma.brandOS.findUnique({ where: { clientId: viewer.clientId } });
  const effectiveQuestions = getEffectiveBriefQuestions(brandOS);
  const nextLegacyQuestion = progress.next;
  const legacyComplete = !nextLegacyQuestion;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold">Your brief</h2>
        <p className="text-sm text-muted-foreground">
          Answer the questions below — our agent will structure the brief and flag any gaps before work starts.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Your answers so far
        </p>
        <Card className="divide-y divide-border p-0">
          {effectiveQuestions.map((q) => {
            const answer = answers[q.key];
            return (
              <div key={q.key} className="flex items-start gap-3 px-5 py-3.5">
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border-2",
                    answer ? "border-success bg-success text-ink" : "border-accent bg-card"
                  )}
                >
                  {answer && <Check className="size-2.5" />}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{q.question}</p>
                  <p className={cn("truncate text-sm", answer ? "text-foreground" : "text-muted-foreground")}>
                    {answer || q.placeholder}
                  </p>
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      {legacyComplete ? (
        <BriefCompleteCard
          brief={brief}
          projectId={id}
          ctaLabel={isDraftProject ? "Start project" : "View project overview"}
          isDraft={isDraftProject}
          state={state}
        />
      ) : (
        <>
          <Card className="flex animate-in fade-in slide-in-from-bottom-1 items-start gap-3 p-5 duration-200">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-ink">
              AI
            </span>
            <div>
              <p className="text-sm">{nextLegacyQuestion.question}</p>
              <p className="mt-0.5 text-xs font-medium text-ink">Brief agent</p>
            </div>
          </Card>

          <AnswerChips
            action={answerBriefQuestionAction}
            hidden={{ briefId: brief.id, key: nextLegacyQuestion.key }}
            quickAnswers={nextLegacyQuestion.quickAnswers}
            customPlaceholder={`Or type your own — ${nextLegacyQuestion.placeholder ?? ""}`}
            thinkingLabel={
              progress.total - progress.answered === 1
                ? [
                    "Reviewing your full brief…",
                    "Checking it against your Brand IQ…",
                    "Weighing what's missing…",
                    "Almost done…",
                  ]
                : "Thinking of what to ask next…"
            }
          />
          <PersistentBriefChat projectId={id} />
        </>
      )}
    </div>
  );
}

function PersistentBriefChat({ projectId }: { projectId: string }) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <p className="text-xs text-muted-foreground">
        Want to say something else, or change an earlier answer? Message your team directly — it doesn&apos;t have
        to wait for the next question.
      </p>
      <CommentComposer action={postCommentAction} projectId={projectId} />
    </Card>
  );
}

function BriefCompleteCard({
  brief,
  projectId,
  ctaLabel,
  isDraft,
  state,
}: {
  brief: {
    status: string;
    aiSummary: string | null;
    aiQualityScore: number | null;
    gapsFlagged: unknown;
    followUpSuggestions: unknown;
  };
  projectId: string;
  ctaLabel: string;
  isDraft: boolean;
  state: ProjectState;
}) {
  const gaps = jsonArray<string>(brief.gapsFlagged);
  const suggestions = jsonArray<string>(brief.followUpSuggestions);

  return (
    <div className="flex flex-col gap-4">
      <Card
        className={cn(
          "animate-in fade-in slide-in-from-bottom-2 border-l-4 p-5 duration-200",
          brief.status === "ACCEPTED" ? "border-l-success" : "border-l-primary"
        )}
      >
        <p className="text-sm font-semibold">
          {isDraft ? "Your brief is ready" : state.nextAction.label}
        </p>
        <p className="text-sm text-muted-foreground">
          {isDraft
            ? "This is still a draft, saved automatically. Invite teammates with Share to collaborate on it, and start the project whenever you're ready — nothing is sent to Klingit until you do."
            : state.nextAction.description}
        </p>
        {brief.aiSummary && (
          <div className="mt-3 flex items-start gap-3 rounded-lg border border-border bg-paper p-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-semibold text-ink">
              AI
            </span>
            <div>
              <p className="text-sm">{brief.aiSummary}</p>
              {brief.aiQualityScore !== null && (
                <p className="mt-1 text-xs text-muted-foreground">Brief readiness: {brief.aiQualityScore}/100</p>
              )}
            </div>
          </div>
        )}

        <CollapsibleGaps gaps={gaps} />

        {isDraft && (
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button asChild size="sm" variant="ghost">
              <Link href="/projects">Save as draft</Link>
            </Button>
            <form action={startProjectAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <Button type="submit" size="sm" className="gap-1.5">
                {ctaLabel}
                <ArrowRight className="size-3.5" />
              </Button>
            </form>
          </div>
        )}
      </Card>

      {brief.status !== "ACCEPTED" && (
        <Card className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-3 p-5 duration-200">
          <div>
            <p className="text-sm font-semibold">Anything to add?</p>
            <p className="text-sm text-muted-foreground">
              This is still a conversation — send your team more detail whenever you have it, or say it&apos;s good
              to go.
            </p>
          </div>
          <SuggestedReplyChips projectId={projectId} suggestions={suggestions} />
          <CommentComposer action={postCommentAction} projectId={projectId} />
          <a href={`/projects/${projectId}?channel=klingit`} className="text-xs font-medium text-primary hover:underline">
            View full discussion →
          </a>
        </Card>
      )}
    </div>
  );
}
