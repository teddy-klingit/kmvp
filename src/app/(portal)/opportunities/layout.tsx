import { getPortalViewer } from "@/lib/current-viewer";

/** Opportunities (Phase W): its own place in the main nav, no longer a tab inside Planner. Each page draws its own header. */
export default async function OpportunitiesLayout({ children }: { children: React.ReactNode }) {
  await getPortalViewer();
  return <div className="flex flex-col gap-6">{children}</div>;
}
