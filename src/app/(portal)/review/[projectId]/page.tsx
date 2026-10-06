import { notFound, redirect } from "next/navigation";
import { getPortalViewer } from "@/lib/current-viewer";
import { loadProjectState } from "@/lib/project-state-loader";
import { KIND_LABEL, loadReview, type ReviewKind } from "@/lib/review";
import { QualityChip } from "@/components/review/quality-chip";
import { AdSetView } from "@/components/review/adset-view";
import { SlidesView } from "@/components/review/slides-view";
import { VideoView } from "@/components/review/video-view";
import { CopyView } from "@/components/review/copy-view";
import type { ShellHeader } from "@/components/review/shell";

const KINDS: ReviewKind[] = ["adset", "slides", "video", "copy"];

/**
 * The client's review of a project (Review*.dc.html): one full-screen shell, one view per format. ?kind picks the
 * format (ad set, slides, video, copy), ?mode its view, ?asset opens one item. Only work sent to the client.
 */
export default async function ReviewPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ kind?: string; mode?: string; asset?: string }> }) {
  const { projectId } = await params;
  const { kind, mode, asset } = await searchParams;
  const viewer = await getPortalViewer();
  // Same visibility as the project page (confidential projects included).
  if (!(await loadProjectState(projectId, viewer.clientId, viewer.id))) notFound();
  const data = await loadReview(projectId, viewer.clientId);
  if (!data) notFound();
  if (data.kinds.length === 0) redirect(`/projects/${projectId}/work`);

  const focus = asset ? data.items.find((i) => i.id === asset) : null;
  const k: ReviewKind = focus?.kind ?? (KINDS.includes(kind as ReviewKind) && data.kinds.some((x) => x.kind === kind) ? (kind as ReviewKind) : (data.kinds.find((x) => x.open > 0) ?? data.kinds[0]).kind);
  const items = data.items.filter((i) => i.kind === k);
  const base = `/review/${projectId}`;
  const version = Math.max(...items.map((i) => i.version));
  const link = (q: Record<string, string>) => `${base}?${new URLSearchParams(q)}`;
  const itemIds = new Set(items.map((i) => i.id));
  const threads = data.threads.filter((t) => (t.assetId ? itemIds.has(t.assetId) : k !== "video" && k !== "copy"));
  const frames = items.every((i) => /frame/i.test(i.format));
  const noun = frames ? "frame" : "slide";

  const subtitle = {
    adset: `Ad set · ${new Set(items.map((i) => i.concept)).size} concepts · ${new Set(items.map((i) => i.size)).size} sizes${data.markets.length ? ` · ${data.markets.length} market${data.markets.length === 1 ? "" : "s"}` : ""} · version ${version}`,
    slides: `${frames ? "Storyboard" : "Presentation"} · ${items.length} ${noun}s · version ${version}`,
    video: `Video · ${Math.round(items[0]?.durationSeconds ?? 15)} s · version ${version}`,
    copy: `Copy · ${new Set(items.flatMap((i) => i.copy?.lines.map((l) => l.lang) ?? [])).size} languages · version ${version}`,
  }[k];
  const title = { adset: `${data.project.name} · ad set`, slides: items[0]?.concept ?? data.project.name, video: focus?.name ?? items[0]?.name ?? data.project.name, copy: "Ad copy" }[k];
  const modes: ShellHeader["modes"] = {
    adset: [
      { label: "Grid", href: link({ kind: "adset" }), active: mode !== "context" },
      { label: "In context", href: link({ kind: "adset", mode: "context" }), active: mode === "context" },
    ],
    slides: [
      { label: frames ? "Frames" : "Slides", href: link({ kind: "slides", ...(focus ? { asset: focus.id } : {}) }), active: mode !== "grid" },
      { label: "Grid", href: link({ kind: "slides", mode: "grid" }), active: mode === "grid" },
    ],
    video: undefined,
    copy: [
      { label: "Suggest", href: link({ kind: "copy" }), active: mode !== "read" },
      { label: "Read", href: link({ kind: "copy", mode: "read" }), active: mode === "read" },
    ],
  }[k];
  const shell: ShellHeader = {
    back: { href: `/projects/${projectId}/work`, label: data.project.name },
    title,
    subtitle,
    chip: <QualityChip total={data.checks.total} items={data.checks.items} />,
    modes,
    formats: data.kinds.map((x) => ({ label: `${KIND_LABEL[x.kind]} · ${x.count}`, href: link({ kind: x.kind }), active: x.kind === k })),
    close: `/projects/${projectId}`,
  };
  const domain = (viewer.client.website ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");

  if (k === "adset") return <AdSetView shell={shell} projectId={projectId} items={items} threads={threads} canReview={data.canReview} mode={mode === "context" ? "context" : "grid"} focusId={focus?.id ?? null} base={base} brand={viewer.client.name} domain={domain} />;
  if (k === "slides") return <SlidesView shell={shell} projectId={projectId} items={items} threads={threads} canReview={data.canReview} mode={mode === "grid" ? "grid" : "slides"} focusId={focus?.id ?? null} base={base} changes={data.changes} noun={noun} />;
  if (k === "video") return <VideoView shell={shell} projectId={projectId} items={items} threads={threads} canReview={data.canReview} focusId={focus?.id ?? null} base={base} />;
  return <CopyView shell={shell} projectId={projectId} items={items} canReview={data.canReview} mode={mode === "read" ? "read" : "suggest"} />;
}
