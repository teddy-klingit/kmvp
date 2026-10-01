import { PersonAvatar } from "@/components/ui/avatar";
import { SectionLabel } from "@/components/ui/card";
import { cn, formatDate } from "@/lib/utils";
import { FIRST_DRAFT_BUSINESS_DAYS, type ProjectState } from "@/lib/project-state";

function facts(state: ProjectState) {
  const { keyFacts } = state;
  const preDraft = ["briefing", "estimating", "awaiting_approval", "staffing"].includes(state.stage);
  return [
    keyFacts.dueDate && { label: "Due", value: formatDate(keyFacts.dueDate) },
    keyFacts.credits !== undefined && { label: "Credits", value: String(keyFacts.credits) },
    keyFacts.firstDraftEta
      ? { label: "First draft", value: formatDate(keyFacts.firstDraftEta) }
      : preDraft && state.stage === "staffing"
        ? { label: "First draft", value: `${FIRST_DRAFT_BUSINESS_DAYS} business days after staffing` }
        : null,
  ].filter((f): f is { label: string; value: string } => Boolean(f));
}

/** Due date, credits, first-draft ETA — only facts that are actually known. */
export function KeyFacts({ state, compact = false }: { state: ProjectState; compact?: boolean }) {
  const list = facts(state);
  if (compact) {
    if (list.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
        {list.map((f) => (
          <span key={f.label}>
            <span className="text-muted-foreground">{f.label} </span>
            <span className="font-medium text-ink">{f.value}</span>
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>Key facts</SectionLabel>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Dates and credits appear here once your estimate is ready.</p>
      ) : (
        <dl className="grid grid-cols-3 gap-2">
          {list.map((f) => (
            <div key={f.label} className="rounded-lg border border-border bg-paper px-3 py-2">
              <dt className="text-[11px] text-muted-foreground">{f.label}</dt>
              <dd className={cn("font-medium text-ink", f.value.length > 12 ? "text-xs" : "text-sm")}>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function KlingitTeam({ state }: { state: ProjectState }) {
  const team = state.keyFacts.staffedTeam;
  const pastStaffing = !["briefing", "estimating", "awaiting_approval", "staffing"].includes(state.stage);
  if (team.length === 0 && pastStaffing) return null;
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>Klingit team</SectionLabel>
      {team.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {team.map((m) => (
            <li key={m.name} className="flex items-center gap-2.5">
              <PersonAvatar name={m.name} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{m.name}</p>
                <p className="truncate text-xs text-muted-foreground">{m.role}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {state.stage === "staffing" ? "Being staffed" : "Assigned once you approve the estimate"}
        </p>
      )}
    </div>
  );
}
