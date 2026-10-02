import { notFound, redirect } from "next/navigation";
import { getPortalViewer } from "@/lib/current-viewer";
import { studioView } from "@/lib/brief-studio/studio";
import { BriefStudio } from "@/components/portal/brief-studio/brief-studio";

/** A draft brief in the studio. Once it's sent, the project Overview takes over. */
export default async function BriefStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getPortalViewer();
  const view = await studioView(viewer, id);
  if (!view) notFound();
  if (!view.editable) redirect(`/projects/${id}`);
  return <BriefStudio initial={view} viewerName={viewer.user.name} />;
}
