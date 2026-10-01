"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Paperclip, Link2, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  startBriefFromIntakeAction,
  submitBriefIntakeAction,
  type IntakeState,
} from "@/lib/actions/brief-intake-actions";
import { ThinkingBubble } from "@/components/portal/thinking-bubble";

const TEXT_LIKE = ["text/plain", "text/markdown", "text/csv"];
const initialState: IntakeState = {};

const THINKING_STEPS = [
  "Reading your brief…",
  "Understanding what you need…",
  "Coming up with a project name…",
  "Thinking of a few good questions…",
];

function useCyclingLabel(active: boolean, steps: string[], intervalMs = 1700) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) {
      setI(0);
      return;
    }
    const id = setInterval(() => setI((v) => (v + 1) % steps.length), intervalMs);
    return () => clearInterval(id);
  }, [active, steps, intervalMs]);
  return steps[i];
}

export function BriefIntakeForm({ projectId, prefill }: { projectId?: string; prefill?: string }) {
  const action = projectId ? submitBriefIntakeAction : startBriefFromIntakeAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [showLink, setShowLink] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileText, setFileText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thinkingLabel = useCyclingLabel(pending, THINKING_STEPS);
  const [submissionKey, setSubmissionKey] = useState(0);
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    setSubmissionKey((k) => k + 1);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    if (TEXT_LIKE.includes(file.type) || /\.(txt|md|csv)$/i.test(file.name)) {
      const reader = new FileReader();
      reader.onload = () => setFileText(String(reader.result ?? ""));
      reader.readAsText(file);
    } else {
      setFileText("");
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-full bg-accent-soft text-ink">
          <Sparkles className="size-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">Tell us what you need</p>
          <p className="text-xs text-muted-foreground">
            Write it however you like — Klingit will name the project and ask what&apos;s missing.
          </p>
        </div>
      </div>

      {pending ? (
        <ThinkingBubble label={thinkingLabel} />
      ) : (
        // Re-keyed per submission so the inputs pick up the returned text
        // instead of React's automatic post-action form reset clearing them.
        <form key={submissionKey} action={formAction} className="flex animate-in fade-in flex-col gap-3 duration-200">
          {projectId && <input type="hidden" name="projectId" value={projectId} />}
          <Textarea
            name="rawText"
            placeholder="e.g. We need a 10-slide investor deck for our Series B raise, due in 3 weeks. Should feel confident and data-led..."
            className="min-h-32"
            defaultValue={state.submitted?.rawText ?? prefill}
            autoFocus
          />

          {(showLink || state.submitted?.link) && (
            <Input
              name="link"
              type="url"
              placeholder="https://... a doc, deck, or reference link"
              defaultValue={state.submitted?.link}
            />
          )}
          <input type="hidden" name="fileName" value={fileName} />
          <input type="hidden" name="fileText" value={fileText} />
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFile} />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowLink((v) => !v)}
              className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <Link2 className="size-3.5" />
              Share a link
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <Paperclip className="size-3.5" />
              {fileName ? fileName : "Attach a file"}
            </button>
          </div>

          {state.error && <p className="text-sm text-danger-foreground">{state.error}</p>}

          {state.existingDraft ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-paper p-4">
              <div>
                <p className="text-sm font-medium">You already have an unfinished draft like this</p>
                <p className="text-sm text-muted-foreground">{state.existingDraft.name}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href={`/projects/${state.existingDraft.id}`}>Continue your draft</Link>
                </Button>
                <Button type="submit" name="startNew" value="1" variant="outline">
                  Start a new project instead
                </Button>
              </div>
            </div>
          ) : (
            <Button type="submit" className="self-start">
              Start my brief
            </Button>
          )}
        </form>
      )}
    </Card>
  );
}
