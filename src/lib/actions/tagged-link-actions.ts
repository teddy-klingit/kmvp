"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";

export type LinkState = { error?: string; ok?: string };

/**
 * Phase V: where an output points (its landing page). The tagged link in the Output library adds the UTMs. Client
 * admins only, and only for the client's own outputs; empty means the client website.
 */
export async function saveOutputLinkAction(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const viewer = await getPortalViewer();
  if (!isClientAdmin(viewer)) return { error: "Only your account's admins can change links." };
  const kind = formData.get("kind") === "output" ? "output" : "asset";
  const id = String(formData.get("id") ?? "");
  const raw = String(formData.get("url") ?? "").trim();
  let url: string | null = null;
  if (raw) {
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) throw new Error();
      // The UTMs are added from the output itself; any already on the link are dropped.
      for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_")) u.searchParams.delete(k);
      url = u.toString();
    } catch {
      return { error: "That isn't a web address." };
    }
  }
  const where = { id, clientId: viewer.clientId };
  const n = kind === "asset" ? (await prisma.asset.updateMany({ where, data: { linkUrl: url } })).count : (await prisma.skillOutput.updateMany({ where, data: { linkUrl: url } })).count;
  if (!n) return { error: "Not found." };
  revalidatePath(kind === "asset" ? `/library/${id}` : `/library/output/${id}`);
  return { ok: url ? "Link saved." : "Back to your website." };
}
