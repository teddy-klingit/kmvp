import { notFound, redirect } from "next/navigation";
import { getPortalViewer } from "@/lib/current-viewer";
import { loadDraft } from "@/lib/brief-studio/studio";

/** Old brief URL: a draft opens in the Brief studio; a sent brief is on Brief & scope. */
export default async function LegacyBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getPortalViewer();
  const draft = await loadDraft(viewer, id);
  if (!draft) notFound();
  redirect(draft.editable ? `/brief/${id}` : `/projects/${id}/scope`);
}
