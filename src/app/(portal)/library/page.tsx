import { Suspense } from "react";
import { getPortalViewer } from "@/lib/current-viewer";
import { loadOutputLibrary } from "@/lib/output-library";
import { OutputLibrary } from "@/components/portal/library/output-library";

const PLATFORM: Record<string, string> = { Meta: "Meta", TikTok: "TikTok", Google: "Google Ads", LinkedIn: "LinkedIn" };

/** Output library (nav v3, 07): produced work only, filters in the URL so views can be shared. */
export default async function OutputLibraryPage({ searchParams }: { searchParams: Promise<{ q?: string; project?: string; format?: string; channel?: string; days?: string; made?: string; sort?: string }> }) {
  const sp = await searchParams;
  const viewer = await getPortalViewer();
  const lib = await loadOutputLibrary(viewer.clientId, {
    q: sp.q,
    project: sp.project,
    format: sp.format,
    channel: sp.channel,
    days: sp.days === "all" ? null : sp.days ? Number(sp.days) || 90 : 90,
    made: sp.made === "skills" || sp.made === "klingit" ? sp.made : null,
    sort: sp.sort === "newest" ? "newest" : "best",
  });
  const platforms = lib.dataSources.platforms.map((p) => PLATFORM[p] ?? p);
  const updated = lib.dataSources.lastUpdate ? (lib.dataSources.lastUpdate === new Date().toISOString().slice(0, 10) ? "updated today" : `updated ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${lib.dataSources.lastUpdate}T12:00:00`))}`) : null;
  const sourcesLine = platforms.length ? `Performance from ${platforms.length > 1 ? `${platforms.slice(0, -1).join(", ")} and ${platforms.at(-1)}` : platforms[0]}${updated ? ` · ${updated}` : ""}` : null;
  return (
    <Suspense>
      <OutputLibrary
        cards={lib.items.map((i) => ({ key: i.key, title: i.title, format: i.format, channel: i.channel, source: i.source, date: i.date.toISOString(), href: i.href, thumb: i.thumb, metric: i.metric?.label ?? null, badge: i.badge }))}
        facets={lib.facets}
        summary={lib.summary}
        sourcesLine={sourcesLine}
      />
    </Suspense>
  );
}
