"use client";

import { useState, useTransition } from "react";
import { Pencil, X, AlertTriangle, History, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { updateAcceptedBriefAction } from "@/lib/actions/brief-revision-actions";
import { SendToChannelDialog } from "@/components/portal/send-to-channel-dialog";

type BriefFields = {
  goals: string | null;
  targetAudience: string | null;
  successMetrics: string | null;
  references: string | null;
};

export type BriefRevisionItem = BriefFields & {
  id: string;
  changedByName: string;
  createdAt: string;
};

const FIELD_META: { key: keyof BriefFields; label: string; placeholder: string }[] = [
  { key: "goals", label: "Objective", placeholder: "What is this project for?" },
  { key: "targetAudience", label: "Audience", placeholder: "Who is this for?" },
  { key: "successMetrics", label: "Success metric", placeholder: "What does success look like?" },
  { key: "references", label: "References", placeholder: "Any references or examples?" },
];

function BriefFieldRows({ brief }: { brief: BriefFields }) {
  return (
    <dl className="flex flex-col gap-3 text-sm">
      {FIELD_META.map((f) => (
        <div key={f.key} className="flex gap-4">
          <dt className="w-32 shrink-0 text-muted-foreground">{f.label}</dt>
          <dd className="whitespace-pre-wrap">{brief[f.key] || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AcceptedBriefView({
  briefId,
  brief,
  revisions,
  projectName,
  channels,
  returnTo,
}: {
  briefId: string;
  brief: BriefFields;
  revisions: BriefRevisionItem[];
  projectName?: string;
  channels?: { id: string; type: string; name: string }[];
  returnTo?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedRevision, setExpandedRevision] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateAcceptedBriefAction({}, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setError(undefined);
        setEditing(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Current brief</p>
          {!editing && (
            <div className="flex items-center gap-2">
              {channels && (
                <SendToChannelDialog
                  channels={channels}
                  subjectType="BRIEF"
                  subjectLabel={projectName ? `${projectName} — Brief` : "Brief"}
                  returnTo={returnTo ?? "/"}
                />
              )}
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" />
                Edit brief
              </Button>
            </div>
          )}
        </div>

        {!editing ? (
          <BriefFieldRows brief={brief} />
        ) : (
          <form
            action={handleSubmit}
            className="flex animate-in fade-in flex-col gap-4 duration-200"
          >
            <input type="hidden" name="briefId" value={briefId} />

            <div className="flex items-start gap-2.5 rounded-lg border border-warning bg-warning-soft p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
              <p className="text-xs text-warning-foreground">
                This project has already been scoped and is underway. Changing the brief now may change the
                estimate and delivery timeline — your account lead will review and confirm any impact.
              </p>
            </div>

            {FIELD_META.map((f) => (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                <Textarea
                  name={f.key}
                  defaultValue={brief[f.key] ?? ""}
                  placeholder={f.placeholder}
                  className="min-h-16"
                  disabled={pending}
                />
              </div>
            ))}

            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="acknowledged" required disabled={pending} className="mt-0.5" />
              I understand this may affect the estimate and delivery timeline.
            </label>

            {error && <p className="text-sm text-danger-foreground">{error}</p>}

            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setEditing(false);
                  setError(undefined);
                }}
                disabled={pending}
                className="gap-1.5"
              >
                <X className="size-3.5" />
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Card>

      {revisions.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex items-center gap-1.5 self-start text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <History className="size-3.5" />
            {revisions.length} earlier version{revisions.length === 1 ? "" : "s"}
            <ChevronDown className={cn("size-3.5 transition-transform", historyOpen && "rotate-180")} />
          </button>
          {historyOpen && (
            <div className="flex flex-col gap-2">
              {revisions.map((r) => (
                <Card key={r.id} className="p-4">
                  <button
                    type="button"
                    onClick={() => setExpandedRevision(expandedRevision === r.id ? null : r.id)}
                    className="flex w-full items-center justify-between text-left"
                  >
                    <p className="text-xs font-medium">
                      Edited by {r.changedByName} · {new Date(r.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", expandedRevision === r.id && "rotate-180")} />
                  </button>
                  {expandedRevision === r.id && (
                    <div className="mt-3 border-t border-border pt-3">
                      <BriefFieldRows brief={r} />
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
