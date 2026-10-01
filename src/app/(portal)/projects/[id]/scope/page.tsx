import { notFound } from "next/navigation";
import { AlertTriangle, ReceiptText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card, CardHeader } from "@/components/ds/card";
import { StatusPill, type PillTone } from "@/components/ds/status-pill";
import { EmptyState } from "@/components/ds/empty-state";
import { BriefRecord } from "@/components/portal/project/brief-record";
import { EstimateTable, Inclusions } from "@/components/portal/project/stage-panels";
import { loadProjectState } from "@/lib/project-state-loader";
import { shortDate } from "@/lib/project-state";
import { jsonArray } from "@/lib/utils";

const ESTIMATE_PILL: Record<string, { label: string; tone: PillTone }> = {
  SENT: { label: "Awaiting your approval", tone: "turn" },
  APPROVED: { label: "Approved", tone: "success" },
  CHANGES_REQUESTED: { label: "Changes asked", tone: "changes" },
  EXPIRED: { label: "Expired", tone: "watch" },
};

type UnresolvedNeed = { description: string; reason?: string };

/** Brief & scope = what was asked for (the brief record), then what was agreed (the estimate). */
export default async function ProjectScopePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const { id } = await params;
  const { sent } = await searchParams;
  const viewer = await getPortalViewer();
  const loaded = await loadProjectState(id, viewer.clientId, viewer.id);
  if (!loaded) notFound();
  const { project, state } = loaded;

  const estimate = await prisma.estimate.findFirst({
    // An unsent DRAFT is Klingit's working copy — never shown to the client.
    where: { projectId: id, status: { not: "DRAFT" }, project: { clientId: viewer.clientId } },
    include: { lineItems: { orderBy: { order: "asc" }, include: { priceListItem: true } }, sentByStaff: { include: { user: true } } },
  });
  const inclusions = jsonArray<string>(estimate?.inclusions);
  const unresolved = jsonArray<UnresolvedNeed>(estimate?.unresolvedNeeds);
  const pill = estimate ? ESTIMATE_PILL[estimate.status] : null;

  return (
    <div className="flex flex-col gap-5">
      <BriefRecord projectId={id} projectName={project.name} viewer={viewer} sent={sent === "1"} />

      <Card aria-label="What was agreed" id="estimate" className="overflow-hidden">
        <CardHeader
          title="What was agreed"
          meta={
            estimate && pill ? (
              <>
                <StatusPill>v{estimate.version}</StatusPill>
                <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
              </>
            ) : undefined
          }
          action={
            estimate?.sentAt ? (
              <span className="text-[12px] text-ds-text-2">
                Sent by {estimate.sentByStaff?.user.name ?? "Klingit"} · {shortDate(estimate.sentAt)}
                {estimate.status === "APPROVED" && estimate.respondedAt ? ` · approved ${shortDate(estimate.respondedAt)}` : ""}
              </span>
            ) : undefined
          }
        />
        {estimate ? (
          <>
            <EstimateTable lines={estimate.lineItems} total={estimate.totalCredits} />
            {inclusions.length > 0 && <Inclusions items={inclusions} />}
          </>
        ) : (
          <EmptyState icon={ReceiptText} title="No estimate yet" description={state.nextAction.label} />
        )}
      </Card>

      {unresolved.length > 0 && (
        <Card aria-label="Out of scope">
          <CardHeader
            title="Out of scope"
            meta={<StatusPill tone="watch">Flagged by the Estimate agent</StatusPill>}
          />
          <div className="flex flex-col gap-3 px-6 pb-5 pt-4">
            <p className="flex items-center gap-2 text-[13px] text-ds-text-2">
              <AlertTriangle className="size-4" />
              Not on the price list, so not included above. Your account lead prices these separately.
            </p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
              {unresolved.map((need) => (
                <li key={need.description}>
                  <span className="font-medium text-ds-text">{need.description}</span>
                  {need.reason && <span className="text-ds-text-2"> — {need.reason}</span>}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
    </div>
  );
}
