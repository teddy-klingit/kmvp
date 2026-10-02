"use client";

import { useState } from "react";
import { Check, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { Field, textareaClass } from "@/components/ops/form-field";

function buildPrompt(idea: string) {
  const description = idea.trim() || "[Describe the app you want.]";
  return `Build a Klingit micro app for this idea:

${description}

Use your terminal and filesystem tools. Start by reading and following https://platform.klingit.com/micro-apps/agent/v1/README.md, then create and organize the project files yourself.

Use Docker for local development, dependencies, tests, package validation, creating the upload archive, and building and running the final image. Do not download, install, or use Node, Python, package managers, or other app tools directly on my computer.

Before coding, check that Docker can build and run containers. If it cannot, stop and tell me. Do not install Docker or give me setup instructions unless I ask. Wait for me to install it or explicitly choose a different workflow, and never claim an unperformed check passed.

Keep Docker resources limited to this app. Do not change or remove unrelated resources.`;
}

/** Kicks off the actual build on platform.klingit.com's Micro Apps pipeline — this app is a publishing registry, not a build system, so it hands the ops user a ready-to-paste prompt rather than building anything itself. */
export function BuildWithAiPrompt() {
  const [open, setOpen] = useState(false);
  const [idea, setIdea] = useState("");
  const [copied, setCopied] = useState(false);

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 rounded-[12px] px-6 py-5 text-left hover:bg-brand-chip/60"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[18px] font-normal leading-[1.45] text-brand-ink">Build with AI</span>
          <span className="text-[13px] text-brand-ink-2">Not built yet? Get a prompt to hand to a coding agent, then register the result below.</span>
        </span>
        {open ? <ChevronUp className="size-4 shrink-0 text-brand-ink-2" strokeWidth={1.75} /> : <ChevronDown className="size-4 shrink-0 text-brand-ink-2" strokeWidth={1.75} />}
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-brand-line px-6 pb-6 pt-5">
          <Field label="Describe the app you want" htmlFor="app-idea">
            <textarea
              id="app-idea"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="e.g. A dashboard that shows this client's weekly content calendar and flags overdue deliverables."
              rows={3}
              className={textareaClass}
            />
          </Field>
          <div className="rounded-[8px] bg-brand-chip p-4">
            <pre className="m-0 whitespace-pre-wrap font-brand-mono text-[12px] leading-[1.6] text-brand-ink-2">{buildPrompt(idea)}</pre>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={async () => {
              await navigator.clipboard.writeText(buildPrompt(idea));
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? (
              <>
                <Check className="size-3.5" /> Copied
              </>
            ) : (
              <>
                <Copy className="size-3.5" /> Copy prompt
              </>
            )}
          </Button>
          <p className="m-0 text-[13px] leading-[1.5] text-brand-ink-2">
            Paste this into a terminal-capable coding agent. Once it&apos;s built and hosted, come back and publish it to this
            client below with its real URL.
          </p>
        </div>
      )}
    </Card>
  );
}
