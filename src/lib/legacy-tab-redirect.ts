import { notFound, redirect } from "next/navigation";
import { getPortalViewer } from "@/lib/current-viewer";
import { loadProjectState } from "@/lib/project-state-loader";
import { legacyTabRedirect, type LegacyTab } from "@/lib/project-state";

/** Server-side redirect for a removed project tab so existing links keep working. */
export async function redirectLegacyTab(tab: LegacyTab, params: Promise<{ id: string }>) {
  const { id } = await params;
  const viewer = await getPortalViewer();
  const loaded = await loadProjectState(id, viewer.clientId, viewer.id);
  if (!loaded) notFound();
  redirect(legacyTabRedirect(tab, id, loaded.state));
}
