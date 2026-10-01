import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { submitChangeRequestAction } from "@/lib/actions/change-request-actions";
import { loadProjectState } from "@/lib/project-state-loader";

const STATUS_TONE = { SUBMITTED: "info", SCOPING: "warning", APPROVED: "success", DECLINED: "danger" } as const;

export default async function ChangeRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getPortalViewer();
  const [requests, loaded] = await Promise.all([
    prisma.changeRequest.findMany({
      where: { projectId: id, project: { clientId: viewer.clientId } },
      orderBy: { createdAt: "desc" },
    }),
    loadProjectState(id, viewer.clientId, viewer.id),
  ]);
  const closed = loaded?.state.stage === "closed";

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5">
        <p className="text-sm font-semibold">Request additional scope</p>
        <p className="mb-4 text-sm text-muted-foreground">
          {closed
            ? "This project is closed, but you can request new work without reopening it — we'll scope it as a fresh mini-brief."
            : "Need something beyond the agreed scope? Describe it and we'll scope it as a separate mini-brief."}
        </p>
        <form action={submitChangeRequestAction} className="flex flex-col gap-3">
          <input type="hidden" name="projectId" value={id} />
          <Textarea name="description" placeholder="What would you like changed or added?" required className="min-h-28" />
          <Button type="submit" className="self-start">
            Submit request
          </Button>
        </form>
      </Card>

      {requests.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Your requests</SectionLabel>
          <Card className="divide-y divide-border p-0">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium">{r.description}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</p>
                </div>
                <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"}>{r.status}</Badge>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
