import type { ChatMessage } from "@/lib/project-conversation";
import { INTERNAL_ROLE_LABEL } from "@/lib/labels";
import { assetTitle } from "@/lib/asset-display";
import { onLabel } from "@/lib/context-label";
import type { Cockpit } from "@/lib/ops-cockpit";

function short(name: string) {
  const [first, last] = name.split(" ");
  return last && last.length > 2 ? `${first} ${last[0]}.` : name;
}

/** The client's "With Klingit" thread as the PM sees it: client names with their company, staff with their role. */
export function clientThread(c: Cockpit, viewerUserId: string): ChatMessage[] {
  return c.thread.map((m) => {
    const isClient = Boolean(m.authorClientUserId);
    const assetLabel = m.asset ? onLabel(assetTitle(m.asset.name, m.asset.format)) : null;
    const label = m.contextLabel ?? assetLabel;
    return {
      id: m.id,
      kind: m.kind,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      authorKey: m.authorClientUserId ?? m.authorUserId ?? "system",
      authorName: isClient ? (m.clientAuthor?.user.name ?? "Client") : m.author ? short(m.author.name) : "Klingit",
      authorRole: isClient ? c.project.client.name : m.author?.staffMember ? INTERNAL_ROLE_LABEL[m.author.staffMember.title] : null,
      mine: !isClient && m.authorUserId === viewerUserId,
      fromKlingit: !isClient,
      ...(label ? { context: { label, href: m.assetId ? `/ops/projects/${c.project.id}#asset-${m.assetId}` : `/ops/projects/${c.project.id}#estimate` } } : {}),
    };
  });
}

export function staffNotesThread(c: Cockpit): ChatMessage[] {
  return c.notes.map((n) => ({
    id: n.id,
    kind: "MESSAGE" as const,
    body: n.body,
    createdAt: n.createdAt.toISOString(),
    authorKey: n.authorUserId,
    authorName: short(n.author.name),
    authorRole: n.author.staffMember ? INTERNAL_ROLE_LABEL[n.author.staffMember.title] : null,
    mine: false,
    fromKlingit: true,
    tone: "note" as const,
  }));
}

export type ActivityItem = { id: string; tag: string; tone: "pm" | "agent" | "client" | "error" | "auto"; title: string; detail?: string; at: Date };

const AGENT_TAG: Record<string, string> = {
  intake_agent: "INT",
  brief_agent: "BRF",
  brief_generator_agent: "BRF",
  estimate_agent: "EST",
  staffing_agent: "STF",
  feedback_agent: "FDB",
};

/** Agent runs, PM/autopilot decisions and client messages, newest first. */
export function activityFeed(c: Cockpit): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const r of c.runs) {
    items.push({
      id: `run-${r.id}`,
      tag: r.status === "FAILED" ? "ERR" : (AGENT_TAG[r.agent.key] ?? "AI"),
      tone: r.status === "FAILED" ? "error" : "agent",
      title: `${r.agent.name}${r.status === "FAILED" ? " failed" : ""}`,
      detail: [r.decision, r.overridden ? `Overridden by ${r.overriddenByUser?.name ?? "a PM"}${r.overrideReason ? `: ${r.overrideReason}` : ""}` : null].filter(Boolean).join(" · ") || undefined,
      at: r.createdAt,
    });
  }
  for (const d of c.decisions) {
    items.push({
      id: `dec-${d.id}`,
      tag: d.actor ? "PM" : "AUTO",
      tone: d.actor ? "pm" : "auto",
      title: `${d.actor ? short(d.actor.name) : "Autopilot"} · ${d.action}`,
      detail: d.reason ?? undefined,
      at: d.createdAt,
    });
  }
  for (const m of c.thread) {
    if (m.kind !== "MESSAGE" || !m.authorClientUserId) continue;
    items.push({
      id: `msg-${m.id}`,
      tag: "MSG",
      tone: "client",
      title: `${m.clientAuthor?.user.name ?? "Client"} wrote`,
      detail: m.body.length > 90 ? `${m.body.slice(0, 87)}…` : m.body,
      at: m.createdAt,
    });
  }
  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}
