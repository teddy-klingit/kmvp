import type { getPortalViewer } from "@/lib/current-viewer";

/** The signed-in client viewer, as resolved by getPortalViewer(). Server helpers take it instead of ids from a form. */
export type PortalViewer = Awaited<ReturnType<typeof getPortalViewer>>;
