"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Check, Copy, FolderPlus, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SendToChannelDialog } from "@/components/portal/send-to-channel-dialog";

type Channel = { id: string; type: string; name: string };

type Props = {
  agentId: string;
  agentKey: string;
  status: string;
  output: unknown;
  channels: Channel[];
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

function TagList({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <Badge key={t} tone="neutral">
          {t}
        </Badge>
      ))}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="gap-1.5"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard access can fail (permissions, insecure context) — the
          // button just silently stays in its un-copied state.
        }
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

/** Plain-text version of each output shape, for the Copy button and (loosely) what a real send would contain. */
function toPlainText(agentKey: string, data: Record<string, unknown>): string {
  switch (agentKey) {
    case "brief_generator_agent":
      return [
        `${data.title}`,
        "",
        `Objective: ${data.objective}`,
        `Target audience: ${data.targetAudience}`,
        `Key message: ${data.keyMessage}`,
        `Tone: ${data.toneNotes}`,
        "",
        "Deliverables:",
        ...((data.deliverables as string[] | undefined) ?? []).map((d) => `- ${d}`),
        "",
        `Suggested channels: ${((data.suggestedChannels as string[] | undefined) ?? []).join(", ")}`,
        `Call to action: ${data.callToAction}`,
      ].join("\n");
    case "linkedin_post_agent":
      return [String(data.hook), "", String(data.body), "", ((data.hashtags as string[] | undefined) ?? []).map((h) => `#${h}`).join(" ")].join("\n");
    case "landing_page_copy_agent":
      return [
        String(data.headline),
        String(data.subheadline),
        "",
        ...((data.sections as { heading: string; body: string }[] | undefined) ?? []).flatMap((s) => [s.heading, s.body, ""]),
        String(data.callToAction),
      ].join("\n");
    case "instagram_caption_agent":
      return [String(data.caption), "", ((data.hashtags as string[] | undefined) ?? []).map((h) => `#${h}`).join(" "), "", `Alt text: ${data.altText}`].join("\n");
    case "email_copy_agent":
      return [
        `Subject options: ${((data.subjectLines as string[] | undefined) ?? []).join(" / ")}`,
        `Preheader: ${data.preheader}`,
        "",
        String(data.body),
      ].join("\n");
    case "ad_gen":
      return [
        `Concept: ${data.concept}`,
        `Headline: ${data.headline}`,
        `Body: ${data.bodyCopy}`,
        `Call to action: ${data.callToAction}`,
        "",
        `Caption (for posting alongside the ad): ${data.caption}`,
        "",
        `Visual direction: ${data.visualDirection}`,
        `Image prompt: ${data.imagePrompt}`,
      ].join("\n");
    case "image_gen_agent":
      return [`Concept: ${data.concept}`, "", `Image prompt: ${data.imagePrompt}`].join("\n");
    default:
      return "";
  }
}

function ActionBar({ agentId, agentKey, data, channels }: { agentId: string; agentKey: string; data: Record<string, unknown>; channels: Channel[] }) {
  const text = toPlainText(agentKey, data);
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <CopyButton text={text} />
      <SendToChannelDialog channels={channels} subjectType="BRIEF" subjectLabel={String(data.title ?? "Generated content")} returnTo={`/assets/agents-templates/agent/${agentId}`} />
      {agentKey === "brief_generator_agent" && (
        <Button asChild variant="secondary" size="sm" className="gap-1.5">
          <Link href={`/projects/new?idea=${encodeURIComponent(String(data.title ?? ""))}&detail=${encodeURIComponent(text)}`}>
            <FolderPlus className="size-3.5" />
            Start a project from this
          </Link>
        </Button>
      )}
    </div>
  );
}

export function SelfServiceOutput({ agentId, agentKey, status, output, channels }: Props) {
  const data = (output ?? {}) as Record<string, unknown>;

  if (status !== "SUCCESS") {
    return (
      <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-foreground">
        {typeof data.error === "string" ? data.error : "Generation failed — try again."}
      </p>
    );
  }

  if (agentKey === "brief_generator_agent") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-paper p-4">
          <p className="text-base font-semibold">{String(data.title ?? "")}</p>
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex gap-4">
              <dt className="w-36 shrink-0 text-muted-foreground">Objective</dt>
              <dd className="whitespace-pre-wrap">{String(data.objective ?? "")}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-36 shrink-0 text-muted-foreground">Target audience</dt>
              <dd className="whitespace-pre-wrap">{String(data.targetAudience ?? "")}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-36 shrink-0 text-muted-foreground">Key message</dt>
              <dd className="whitespace-pre-wrap">{String(data.keyMessage ?? "")}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-36 shrink-0 text-muted-foreground">Tone</dt>
              <dd className="whitespace-pre-wrap">{String(data.toneNotes ?? "")}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-36 shrink-0 text-muted-foreground">Deliverables</dt>
              <dd>
                <ul className="list-inside list-disc space-y-0.5">
                  {(data.deliverables as string[] | undefined)?.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-36 shrink-0 text-muted-foreground">Suggested channels</dt>
              <dd>
                <TagList tags={(data.suggestedChannels as string[]) ?? []} />
              </dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-36 shrink-0 text-muted-foreground">Call to action</dt>
              <dd className="whitespace-pre-wrap">{String(data.callToAction ?? "")}</dd>
            </div>
          </dl>
        </div>
        <ActionBar agentId={agentId} agentKey={agentKey} data={data} channels={channels} />
      </div>
    );
  }

  if (agentKey === "linkedin_post_agent") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-paper p-4">
          <p className="text-sm font-semibold">{String(data.hook ?? "")}</p>
          <p className="whitespace-pre-wrap text-sm text-foreground">{String(data.body ?? "")}</p>
          {((data.hashtags as string[] | undefined)?.length ?? 0) > 0 && (
            <p className="text-xs text-ink">{(data.hashtags as string[]).map((h) => `#${h}`).join(" ")}</p>
          )}
        </div>
        <ActionBar agentId={agentId} agentKey={agentKey} data={data} channels={channels} />
      </div>
    );
  }

  if (agentKey === "landing_page_copy_agent") {
    const sections = (data.sections as { heading: string; body: string }[] | undefined) ?? [];
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-paper p-4">
          <div>
            <p className="text-base font-semibold">{String(data.headline ?? "")}</p>
            <p className="text-sm text-muted-foreground">{String(data.subheadline ?? "")}</p>
          </div>
          {sections.map((s, i) => (
            <Field key={i} label={s.heading} value={<p className="whitespace-pre-wrap">{s.body}</p>} />
          ))}
          <Field label="Call to action" value={String(data.callToAction ?? "")} />
        </div>
        <ActionBar agentId={agentId} agentKey={agentKey} data={data} channels={channels} />
      </div>
    );
  }

  if (agentKey === "instagram_caption_agent") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-paper p-4">
          <p className="whitespace-pre-wrap text-sm text-foreground">{String(data.caption ?? "")}</p>
          {((data.hashtags as string[] | undefined)?.length ?? 0) > 0 && (
            <p className="text-xs text-ink">{(data.hashtags as string[]).map((h) => `#${h}`).join(" ")}</p>
          )}
          <p className="text-xs text-muted-foreground">Alt text: {String(data.altText ?? "")}</p>
        </div>
        <ActionBar agentId={agentId} agentKey={agentKey} data={data} channels={channels} />
      </div>
    );
  }

  if (agentKey === "email_copy_agent") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-paper p-4">
          <Field
            label="Subject line options"
            value={
              <ul className="list-inside list-disc space-y-0.5">
                {(data.subjectLines as string[] | undefined)?.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            }
          />
          <Field label="Preheader" value={String(data.preheader ?? "")} />
          <Field label="Body" value={<p className="whitespace-pre-wrap">{String(data.body ?? "")}</p>} />
        </div>
        <ActionBar agentId={agentId} agentKey={agentKey} data={data} channels={channels} />
      </div>
    );
  }

  if (agentKey === "ad_gen") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-paper p-4">
          {typeof data.imageDataUri === "string" ? (
            <Image
              src={data.imageDataUri}
              alt={String(data.concept ?? "Generated ad visual")}
              width={640}
              height={640}
              unoptimized
              className="w-full max-w-md rounded-lg border border-border object-cover"
            />
          ) : (
            <div className="flex items-start gap-2.5 rounded-lg border border-warning bg-warning-soft p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
              <p className="text-xs text-warning-foreground">
                {typeof data.imageError === "string" ? data.imageError : "Image generation didn't run."} The concept and image prompt below are still
                ready to use.
              </p>
            </div>
          )}
          <Field label="Concept" value={String(data.concept ?? "")} />
          <Field label="Headline (on image)" value={String(data.headline ?? "")} />
          <Field label="Body copy (on image)" value={String(data.bodyCopy ?? "")} />
          <Field label="Call to action (on image)" value={String(data.callToAction ?? "")} />
          <Field label="Caption (for posting alongside the ad)" value={<p className="whitespace-pre-wrap">{String(data.caption ?? "")}</p>} />
          <Field label="Visual direction" value={String(data.visualDirection ?? "")} />
          <Field
            label="Image generation prompt"
            value={
              <code className="block whitespace-pre-wrap rounded-md bg-card px-3 py-2 text-xs leading-relaxed text-foreground">
                {String(data.imagePrompt ?? "")}
              </code>
            }
          />
          <Field label="Style tags" value={<TagList tags={(data.styleTags as string[]) ?? []} />} />
          <Field label="Avoid" value={String(data.negativePrompt ?? "")} />
          <Field label="Suggested aspect ratio" value={String(data.aspectRatioSuggestion ?? "")} />
        </div>
        <ActionBar agentId={agentId} agentKey={agentKey} data={data} channels={channels} />
      </div>
    );
  }

  if (agentKey === "image_gen_agent") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-paper p-4">
          {typeof data.imageDataUri === "string" ? (
            <Image
              src={data.imageDataUri}
              alt={String(data.concept ?? "Generated image")}
              width={640}
              height={640}
              unoptimized
              className="w-full max-w-md rounded-lg border border-border object-cover"
            />
          ) : (
            <div className="flex items-start gap-2.5 rounded-lg border border-warning bg-warning-soft p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
              <p className="text-xs text-warning-foreground">
                {typeof data.imageError === "string" ? data.imageError : "Image generation didn't run."} The concept and image prompt below are still
                ready to use.
              </p>
            </div>
          )}
          <Field label="Concept" value={String(data.concept ?? "")} />
          <Field
            label="Image generation prompt"
            value={
              <code className="block whitespace-pre-wrap rounded-md bg-card px-3 py-2 text-xs leading-relaxed text-foreground">
                {String(data.imagePrompt ?? "")}
              </code>
            }
          />
          <Field label="Style tags" value={<TagList tags={(data.styleTags as string[]) ?? []} />} />
          <Field label="Avoid" value={String(data.negativePrompt ?? "")} />
          <Field label="Suggested aspect ratio" value={String(data.aspectRatioSuggestion ?? "")} />
        </div>
        <ActionBar agentId={agentId} agentKey={agentKey} data={data} channels={channels} />
      </div>
    );
  }

  return null;
}
