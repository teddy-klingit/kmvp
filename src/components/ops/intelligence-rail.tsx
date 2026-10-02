import { SectionLabel } from "@/components/ui/card";
import { Badge, STATUS_TONE } from "@/components/ui/badge";
import { PersonAvatar } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/utils";
import { platformStatus } from "@/lib/brand-completeness";
import { PROJECT_STATUS_LABEL } from "@/lib/labels";
import type { ClientWorkspace } from "@/lib/data/ops-client-workspace";

const projectHealthLabel = (status: string) =>
  status === "IN_PRODUCTION" || status === "STAFFING" || status === "ESTIMATING" ? "On track" : PROJECT_STATUS_LABEL[status];

export function IntelligenceRail({ client, activeProject }: ClientWorkspace) {
  return (
    <aside className="flex w-72 shrink-0 flex-col gap-6 border-l border-border px-5 py-6">
      <div>
        <SectionLabel>Brand intelligence</SectionLabel>
        <p className="mt-1 text-sm font-semibold">{client.name}</p>
        <p className="text-sm text-muted-foreground">{client.brandSummary}</p>
      </div>

      {activeProject && (
        <div>
          <SectionLabel>Active project</SectionLabel>
          <p className="mt-1 text-sm font-semibold">{activeProject.name}</p>
          <p className="text-sm text-muted-foreground">
            {/* Only facts we have: no "—c" or "TBD" placeholders. */}
            {[
              activeProject.creditsQuoted !== null ? `${activeProject.creditsQuoted}c` : null,
              activeProject.dueDate ? `Due ${formatDate(activeProject.dueDate)}` : null,
              activeProject.team?.members[0]?.staffMember.user.name.split(" ")[0] ?? "Unassigned",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <Badge tone={STATUS_TONE[projectHealthLabel(activeProject.status)] ?? "neutral"} className="mt-2">
            {projectHealthLabel(activeProject.status)}
          </Badge>
        </div>
      )}

      {(() => {
        // Computed from what's written (Brand IQ), never the stored percentage.
        const brand = platformStatus({ brandSummary: client.brandSummary, brandOS: client.brandOS });
        return (
          <div>
            <SectionLabel>Foundation</SectionLabel>
            <p className="mt-1 text-sm font-medium">
              Brand OS: {brand.done} of {brand.total} sections written
            </p>
            <Progress value={(brand.done / brand.total) * 100} className="mt-1.5" />
            {client.brandOS?.lastSyncedAt && <p className="mt-1 text-xs text-muted-foreground">Synced {formatDate(client.brandOS.lastSyncedAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
          </div>
        );
      })()}

      {activeProject && activeProject.agentRuns.length > 0 && (
        <div>
          <SectionLabel>Agents active</SectionLabel>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {Array.from(new Map(activeProject.agentRuns.map((r) => [r.agent.name, r])).values()).map((r) => (
              <Badge key={r.id} tone="accent">
                {r.agent.name.replace(" agent", "")}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {client.accountLead && (
        <div>
          <SectionLabel>PM contact</SectionLabel>
          <div className="mt-1.5 flex items-center gap-2.5">
            <PersonAvatar name={client.accountLead.user.name} size="sm" />
            <div>
              <p className="text-sm font-medium">{client.accountLead.user.name}</p>
              <button className="text-xs text-primary hover:underline">Schedule a call</button>
            </div>
          </div>
        </div>
      )}

      {client.touchpoints.length > 0 && (
        <div>
          <SectionLabel>Touchpoints</SectionLabel>
          <div className="mt-1.5 flex flex-col gap-1">
            {client.touchpoints.map((t) => (
              <p key={t.id} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{formatDate(t.scheduledAt, { day: "2-digit", month: "2-digit" })}</span>{" "}
                {t.title}
                {t.withClientUser && ` · ${t.withClientUser.user.name}`}
              </p>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
