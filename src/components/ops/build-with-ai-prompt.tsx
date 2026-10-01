"use client";

import { useState } from "react";
import { Check, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

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
    <Card className="p-5">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <div>
          <p className="text-sm font-medium">Build with AI</p>
          <p className="text-xs text-muted-foreground">Not built yet? Get a prompt to hand to a coding agent, then register the result below.</p>
        </div>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="app-idea">Describe the app you want</Label>
            <Textarea
              id="app-idea"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="e.g. A dashboard that shows this client's weekly content calendar and flags overdue deliverables."
              rows={3}
            />
          </div>
          <div className="rounded-lg border border-border bg-paper p-3">
            <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{buildPrompt(idea)}</pre>
          </div>
          <Button
            type="button"
            variant="secondary"
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
          <p className="text-xs text-muted-foreground">
            Paste this into a terminal-capable coding agent. Once it&apos;s built and hosted, come back and publish it to this
            client below with its real URL.
          </p>
        </div>
      )}
    </Card>
  );
}
