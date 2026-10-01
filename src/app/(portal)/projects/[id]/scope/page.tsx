import { notFound } from "next/navigation";
import { AlertTriangle, Check } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card, SectionLabel } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { BriefRecord } from "@/components/portal/project/brief-record";
import { loadProjectState } from "@/lib/project-state-loader";
import { formatDate, jsonArray } from "@/lib/utils";

const ESTIMATE_BADGE: Record<string, string> = {
  SENT: "Awaiting your approval",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes asked",
  EXPIRED: "Expired",
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
    include: { lineItems: { orderBy: { order: "asc" } }, sentByStaff: { include: { user: true } } },
  });
  const inclusions = jsonArray<string>(estimate?.inclusions);
  const unresolved = jsonArray<UnresolvedNeed>(estimate?.unresolvedNeeds);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <SectionLabel>What you asked for</SectionLabel>
        <BriefRecord projectId={id} projectName={project.name} viewer={viewer} sent={sent === "1"} />
      </section>

      <section id="estimate" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <SectionLabel>What was agreed</SectionLabel>
          {estimate && <StatusBadge status={ESTIMATE_BADGE[estimate.status] ?? estimate.status} />}
        </div>
        {!estimate ? (
          <Card className="p-5 text-sm text-muted-foreground">No estimate yet. {state.nextAction.label}.</Card>
        ) : (
          <>
            <Card className="overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Deliverable</th>
                    <th className="px-5 py-3 text-left font-medium">Detail</th>
                    <th className="px-5 py-3 text-right font-medium">Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {estimate.lineItems.map((li) => (
                    <tr key={li.id} className="border-t border-border">
                      <td className="px-5 py-3 font-medium">{li.deliverable}</td>
                      <td className="px-5 py-3 text-muted-foreground">{li.detail}</td>
                      <td className="px-5 py-3 text-right">{li.credits}c</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border font-semibold">
                    <td className="px-5 py-3">Total</td>
                    <td />
                    <td className="px-5 py-3 text-right">{estimate.totalCredits}c</td>
                  </tr>
                </tbody>
              </table>
              <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
                Priced from the Klingit price list · sent by {estimate.sentByStaff?.user.name ?? "Klingit"}
                {estimate.sentAt && ` on ${formatDate(estimate.sentAt)}`}
                {estimate.respondedAt && estimate.status === "APPROVED" && ` · approved ${formatDate(estimate.respondedAt)}`}
              </p>
            </Card>

            {inclusions.length > 0 && (
              <Card className="flex flex-col gap-2 p-5">
                {inclusions.map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm">
                    <Check className="size-3.5 shrink-0" />
                    {item}
                  </div>
                ))}
              </Card>
            )}

            {unresolved.length > 0 && (
              <Card className="flex flex-col gap-3 border border-border p-5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4" />
                  <p className="text-sm font-semibold">Out of scope — flagged by the Estimate agent</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Not on the price list, so not included above. Your account lead will price these separately.
                </p>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {unresolved.map((need) => (
                    <li key={need.description}>
                      <span className="font-medium">{need.description}</span>
                      {need.reason && <span className="text-muted-foreground"> — {need.reason}</span>}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </section>
    </div>
  );
}
