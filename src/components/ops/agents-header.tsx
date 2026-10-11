import { PageHeader } from "@/components/ds/page-header";

/** Ops → Skills & AI: Catalog · Decision log. PMs see the log only (the catalog is Admin-only). */
export function AgentsHeader({ eyebrow, admin }: { eyebrow: string; admin: boolean }) {
  return (
    <PageHeader
      eyebrow={eyebrow}
      title="Skills & AI"
      tabsLabel="Skills & AI views"
      tabs={admin ? [{ label: "Catalog", href: "/ops/skills" }, { label: "Decision log", href: "/ops/skills/audit" }] : undefined}
    />
  );
}
