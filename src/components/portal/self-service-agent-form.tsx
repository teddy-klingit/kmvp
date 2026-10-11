"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ThinkingBubble } from "@/components/portal/thinking-bubble";
import { runSelfServiceAgentAction, type SelfServiceAgentState } from "@/lib/actions/self-service-agent-actions";

const initialState: SelfServiceAgentState = {};

const THINKING_LABEL: Record<string, string> = {
  brief_generator_agent: "Drafting your brief…",
  ad_gen: "Building your ad and generating the image…",
  image_gen_agent: "Generating your image…",
  linkedin_post_agent: "Writing your LinkedIn post…",
  landing_page_copy_agent: "Writing your landing page copy…",
  instagram_caption_agent: "Writing your caption…",
  email_copy_agent: "Writing your email copy…",
};

const NICHE_COPY_KEYS = new Set(["linkedin_post_agent", "landing_page_copy_agent", "instagram_caption_agent", "email_copy_agent"]);

const KNOWN = new Set(["brief_generator_agent", "ad_gen", "image_gen_agent", ...NICHE_COPY_KEYS]);

/**
 * The run form for a skill: one set of fields per standard skill, one input for a custom skill. A template
 * prefills the format; the button says what the run is about to cost.
 */
export function SelfServiceAgentForm({ agentId, agentKey, template, cost }: { agentId: string; agentKey: string; template?: { name: string; category: string } | null; cost?: string | null }) {
  const [state, formAction, pending] = useActionState(runSelfServiceAgentAction, initialState);

  if (pending) {
    return <ThinkingBubble label={THINKING_LABEL[agentKey] ?? "Working on it…"} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="agentId" value={agentId} />

      {agentKey === "brief_generator_agent" && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="idea">What do you want to make?</Label>
            <Textarea id="idea" name="idea" required placeholder="e.g. A short video series introducing our new engineering team" className="min-h-20" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal">What should it achieve?</Label>
            <Textarea id="goal" name="goal" required placeholder="e.g. Drive engineering job applications from mid-level candidates" className="min-h-16" />
          </div>
        </>
      )}

      {NICHE_COPY_KEYS.has(agentKey) && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal">Goal</Label>
            <Input id="goal" name="goal" required placeholder="e.g. Announce our new office opening" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="keyPoints">Key points to include</Label>
            <Textarea id="keyPoints" name="keyPoints" required placeholder="e.g. Opens March 1st, Stockholm, open house event" className="min-h-16" />
          </div>
        </>
      )}

      {agentKey === "ad_gen" && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="format">Format</Label>
            <Input id="format" name="format" required defaultValue={template?.name} placeholder="e.g. Instagram feed ad, LinkedIn single image, Story" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="idea">Idea</Label>
            <Textarea id="idea" name="idea" required placeholder="e.g. A bold visual celebrating our 5th anniversary" className="min-h-20" />
          </div>
        </>
      )}

      {agentKey === "image_gen_agent" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="idea">What do you want the image to show?</Label>
          <Textarea id="idea" name="idea" required placeholder="e.g. A calm illustration of a person listening to headphones on a commute, for a blog header" className="min-h-20" />
        </div>
      )}

      {!KNOWN.has(agentKey) && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="input">What should it work on?</Label>
          <Textarea id="input" name="input" required placeholder="Paste or describe the input, e.g. an INCI list or a product page" className="min-h-28" />
        </div>
      )}

      {state.error && (
        <p className="m-0 text-sm text-danger-foreground">
          {state.error}{" "}
          {state.topUp && (
            <Link href="/settings/usage#top-up" className="text-brand-ink underline underline-offset-2">
              Top up
            </Link>
          )}
        </p>
      )}

      <span className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="accent" className="gap-1.5">
          <Sparkles className="size-4" />
          Run
        </Button>
        {cost && <span className="text-[13px] text-brand-ink-2">{cost}</span>}
      </span>
    </form>
  );
}
