import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { RulesView } from "@/components/portal/rules/rules-view";

/**
 * Brand OS → Rules (Phase R, design 01): admins add, edit, turn off and remove rules; members suggest; Klingit edits
 * from ops. Every change is in Change history and can be undone. Typography and colours are in Visual identity.
 */
export default async function RulesPage({ searchParams }: { searchParams: Promise<{ history?: string }> }) {
  const viewer = await getPortalViewer();
  const { history } = await searchParams;
  return <RulesView clientId={viewer.clientId} mode={isClientAdmin(viewer) ? "admin" : "member"} showAll={history === "all"} />;
}
