import { Suspense } from "react";
import { getPortalViewer } from "@/lib/current-viewer";
import { loadOutputLibrary, type LibraryItem } from "@/lib/output-library";
import { OutputLibrary, type LibraryCard } from "@/components/portal/library/output-library";
import { isCategory } from "@/lib/output-categories";

const card = (i: LibraryItem): LibraryCard => ({ key: i.key, title: i.title, category: i.category, meta: i.meta, date: i.date.toISOString(), href: i.href, thumb: i.thumb, info: i.info, badge: i.badge });

/** Output library (Phase U): every kind of work by category; filters in the URL so views can be shared. */
export default async function OutputLibraryPage({ searchParams }: { searchParams: Promise<{ q?: string; project?: string; days?: string; made?: string; category?: string; view?: string }> }) {
  const sp = await searchParams;
  const viewer = await getPortalViewer();
  const lib = await loadOutputLibrary(viewer.clientId, {
    q: sp.q,
    project: sp.project,
    days: sp.days ? Number(sp.days) || null : null,
    made: sp.made === "skills" || sp.made === "klingit" || sp.made === "client" ? sp.made : null,
    category: isCategory(sp.category) ? sp.category : null,
    sort: "newest",
  });
  return (
    <Suspense>
      <OutputLibrary cards={lib.items.map(card)} newThisMonth={lib.newThisMonth.map(card)} counts={lib.categoryCounts} total={lib.total} projects={lib.facets.projects} view={sp.view === "list" ? "list" : "grid"} />
    </Suspense>
  );
}
