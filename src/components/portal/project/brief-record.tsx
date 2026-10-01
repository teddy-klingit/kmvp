import { Check, FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { EmptyState } from "@/components/ds/empty-state";
import { AcceptedBriefView } from "@/components/portal/accepted-brief-view";
import { jsonArray } from "@/lib/utils";
import type { PortalViewer } from "@/lib/brief-intake";

type TranscriptTurn = { question: string; answer: string };

/** "What you asked for": the full brief record — editable with version history once accepted. */
export async function BriefRecord({ projectId, projectName, viewer, sent }: { projectId: string; projectName: string; viewer: PortalViewer; sent?: boolean }) {
  const brief = await prisma.brief.findFirst({ where: { projectId, project: { clientId: viewer.clientId } } });

  if (!brief) {
    return (
      <Card>
        <EmptyState icon={FileText} title="Nothing written yet" description="The brief starts on the Overview tab." />
      </Card>
    );
  }

  if (brief.status === "ACCEPTED") {
    const [revisions, channels] = await Promise.all([
      prisma.briefRevision.findMany({ where: { briefId: brief.id }, orderBy: { createdAt: "desc" } }),
      prisma.connectedChannel.findMany({ where: { clientId: viewer.clientId }, orderBy: { connectedAt: "asc" } }),
    ]);
    return (
      <div className="flex flex-col gap-3">
        {sent && (
          <Card className="flex items-center gap-2 px-6 py-3 text-[14px]">
            <Check className="size-4 text-ds-check" />
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
    <Card aria-label="Brief">
      <CardHeader title="Brief" meta={<StatusPill tone={gaps.length ? "turn" : "neutral"}>{gaps.length ? `${gaps.length} missing` : "In progress"}</StatusPill>} />
      <div className="divide-y divide-ds-divider">
        {brief.rawIntake && (
          <Row label="In your words" value={brief.rawIntake} />
        )}
        {fields.map((f) => (
          <Row key={f.label} label={f.label} value={f.value} />
        ))}
        {transcript.map((t, i) => (
          <Row key={i} label={t.question} value={t.answer} />
        ))}
        {brief.aiSummary && <Row label="Brief agent summary" value={brief.aiSummary} />}
        {gaps.length > 0 && <Row label="Still missing" value={gaps.join(" · ")} />}
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-6 py-4">
      <span className="text-[13px] text-ds-text-2">{label}</span>
      <span className="whitespace-pre-line text-[14px] text-ds-text">{value}</span>
    </div>
  );
}
