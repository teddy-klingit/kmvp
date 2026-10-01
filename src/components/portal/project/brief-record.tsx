import { Check } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, SectionLabel } from "@/components/ui/card";
import { AcceptedBriefView } from "@/components/portal/accepted-brief-view";
import { jsonArray } from "@/lib/utils";
import type { PortalViewer } from "@/lib/brief-intake";

type TranscriptTurn = { question: string; answer: string };

/** "What was asked for": the full brief record — editable with version history once accepted. */
export async function BriefRecord({ projectId, projectName, viewer, sent }: { projectId: string; projectName: string; viewer: PortalViewer; sent?: boolean }) {
  const brief = await prisma.brief.findFirst({ where: { projectId, project: { clientId: viewer.clientId } } });

  if (!brief) {
    return (
      <Card className="p-5 text-sm text-muted-foreground">Nothing written yet — the brief starts on the Overview tab.</Card>
    );
  }

  if (brief.status === "ACCEPTED") {
    const [revisions, channels] = await Promise.all([
      prisma.briefRevision.findMany({ where: { briefId: brief.id }, orderBy: { createdAt: "desc" } }),
      prisma.connectedChannel.findMany({ where: { clientId: viewer.clientId }, orderBy: { connectedAt: "asc" } }),
    ]);
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Accepted by your account lead. You can still update it — they&apos;ll confirm if it changes scope.
        </p>
        {sent && (
          <Card className="flex items-center gap-2 border-l-4 border-l-success p-3 text-sm">
            <Check className="size-4 text-success-foreground" />
            Sent — your team will find it in the channel you picked.
          </Card>
        )}
        <AcceptedBriefView
          briefId={brief.id}
          brief={{
            goals: brief.goals,
            targetAudience: brief.targetAudience,
            successMetrics: brief.successMetrics,
            references: brief.references,
          }}
          revisions={revisions.map((r) => ({
            id: r.id,
            goals: r.goals,
            targetAudience: r.targetAudience,
            successMetrics: r.successMetrics,
            references: r.references,
            changedByName: r.changedByName,
            createdAt: r.createdAt.toISOString(),
          }))}
          projectName={projectName}
          channels={channels}
          returnTo={`/projects/${projectId}/scope`}
        />
      </div>
    );
  }

  const transcript = jsonArray<TranscriptTurn>(brief.transcript);
  const fields = [
    { label: "Objective", value: brief.rawIntake ? null : brief.goals },
    { label: "Audience", value: brief.targetAudience },
    { label: "Success metric", value: brief.successMetrics },
    { label: "References", value: brief.references },
  ].filter((f): f is { label: string; value: string } => Boolean(f.value));
  const gaps = jsonArray<string>(brief.gapsFlagged);

  return (
    <div className="flex flex-col gap-3">
      {brief.rawIntake && (
        <Card className="p-5">
          <SectionLabel>In your words</SectionLabel>
          <p className="mt-2 whitespace-pre-line text-sm">{brief.rawIntake}</p>
          {(brief.sourceLink || brief.sourceFileName) && (
            <p className="mt-2 text-xs text-muted-foreground">
              {[brief.sourceLink, brief.sourceFileName].filter(Boolean).join(" · ")}
            </p>
          )}
        </Card>
      )}
      {(fields.length > 0 || transcript.length > 0) && (
        <Card className="divide-y divide-border p-0">
          {fields.map((f) => (
            <div key={f.label} className="flex gap-4 px-5 py-3 text-sm">
              <span className="w-32 shrink-0 text-muted-foreground">{f.label}</span>
              <span>{f.value}</span>
            </div>
          ))}
          {transcript.map((t, i) => (
            <div key={i} className="px-5 py-3 text-sm">
              <p className="text-muted-foreground">{t.question}</p>
              <p>{t.answer}</p>
            </div>
          ))}
        </Card>
      )}
      {brief.aiSummary && (
        <Card className="p-5">
          <SectionLabel>Brief agent summary</SectionLabel>
          <p className="mt-2 text-sm">{brief.aiSummary}</p>
        </Card>
      )}
      {gaps.length > 0 && (
        <Card className="p-5">
          <SectionLabel>Still missing</SectionLabel>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
