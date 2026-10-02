import { PageHeader } from "@/components/ds/page-header";

/** Ops → Agents: Library · Decision log. PMs see the log only (the library is Admin-only). */
export function AgentsHeader({ eyebrow, admin }: { eyebrow: string; admin: boolean }) {
  return (
    <PageHeader
      eyebrow={eyebrow}
      title="Agents"
      tabsLabel="Agents views"
      tabs={admin ? [{ label: "Library", href: "/ops/agents" }, { label: "Decision log", href: "/ops/agents/audit" }] : undefined}
    />
  );
}
