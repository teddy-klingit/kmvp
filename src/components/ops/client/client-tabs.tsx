"use client";

import { usePathname } from "next/navigation";
import { SegmentedNav } from "@/components/ds/segmented-control";
import { FilterChips } from "@/components/ds/filter-chips";

/**
 * The client page's 5 tabs (Phase T): Overview · Projects · Planner · Contract & billing · Brand. Every older view
 * lives under one of them as a chip, so nothing is lost and old links still land on the right tab.
 */
export const CLIENT_TABS = [
  { label: "Overview", path: "dashboard", sub: [] as { label: string; path: string }[] },
  { label: "Projects", path: "projects", sub: [{ label: "Projects", path: "projects" }, { label: "Files", path: "project-files" }, { label: "Delivery", path: "delivery" }, { label: "Activity", path: "activity" }] },
  { label: "Planner", path: "planner", sub: [{ label: "Planner", path: "planner" }, { label: "Content plan", path: "content-plan" }, { label: "Opportunities", path: "opportunities" }] },
  { label: "Contract & billing", path: "contract", sub: [{ label: "Contract", path: "contract" }, { label: "Balances", path: "balances" }, { label: "Billing", path: "billing" }, { label: "Setup", path: "admin" }, { label: "Custom apps", path: "custom-apps" }] },
  { label: "Brand", path: "brand-os", sub: [{ label: "Brand OS", path: "brand-os" }, { label: "Brand assets", path: "brand-assets" }] },
];

/** Views only Admin opens: invoices and payments (Billing) and the client's set-up (Setup). */
export const ADMIN_ONLY_VIEWS = ["billing", "admin"];

export function ClientTabs({ base, counts, admin }: { base: string; counts: { projects: number; plan: number }; admin: boolean }) {
  const pathname = usePathname() ?? "";
  const tabs = CLIENT_TABS.map((t) => (admin ? t : { ...t, label: t.label === "Contract & billing" ? "Contract" : t.label, sub: t.sub.filter((s) => !ADMIN_ONLY_VIEWS.includes(s.path)) }));
  const seg = pathname.slice(base.length + 1).split("/")[0] || "dashboard";
  const current = tabs.find((t) => t.path === seg || t.sub.some((s) => s.path === seg)) ?? tabs[0];
  return (
    <div className="flex flex-col gap-3">
      <SegmentedNav
        label="Client"
        items={tabs.map((t) => ({
          label: t.label === "Projects" && counts.projects ? `Projects ${counts.projects}` : t.label === "Planner" && counts.plan ? `Planner ${counts.plan}` : t.label,
          href: `${base}/${t.path}`,
          active: t === current,
        }))}
      />
      {current.sub.length > 1 && <FilterChips label={`${current.label} views`} items={current.sub.map((s) => ({ label: s.label, href: `${base}/${s.path}`, active: s.path === seg }))} />}
    </div>
  );
}
