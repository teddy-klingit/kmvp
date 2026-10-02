import { CLIENT_STAGE_LABEL, type ClientStage } from "@/lib/project-state";

/**
 * What a client may drag on the Projects board. Pure, so the board and the server agree:
 * a draft dropped on Queued sends its brief; Queued cards reorder the queue; Klingit moves everything else.
 */
export type Lane = Exclude<ClientStage, "archived">;

export type DragRule = { allowed: true; kind: "send" | "reorder" } | { allowed: false; reason: string };

export const canPickUp = (lane: Lane) => lane === "draft" || lane === "queued";

export function dragRule(from: Lane, to: Lane): DragRule {
  if (from === "draft" && to === "queued") return { allowed: true, kind: "send" };
  if (from === "queued" && to === "queued") return { allowed: true, kind: "reorder" };
  if (to === "draft") return { allowed: false, reason: from === "draft" ? "Drafts stay in the order you edit them" : "A sent brief can't go back to Drafts" };
  return { allowed: false, reason: `Klingit moves projects to ${CLIENT_STAGE_LABEL[to]}` };
}
