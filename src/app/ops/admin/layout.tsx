import { requireOpsPage } from "@/lib/authz";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { adminJobCounts } from "@/lib/admin-jobs";

/** Admin (Phase T): set-up, prices, billing and migration, for admins only. Not part of a PM's day. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireOpsPage(["ADMIN"]);
  const c = await adminJobCounts();
  return (
    <OpsPage>
      <PageHeader
        eyebrow="Set-up, prices, billing · not part of a PM's day"
        title="Admin"
        tabsLabel="Admin"
        tabs={[
          { label: "To set up", href: "/ops/admin", badge: c.jobs || undefined },
          { label: "Price List", href: "/ops/admin/price-list" },
          { label: "Billing", href: "/ops/admin/billing" },
          { label: "Migration", href: "/ops/admin/migration", badge: c.oldPlans || undefined },
          { label: "Plans & settings", href: "/ops/admin/settings" },
        ]}
      />
      {children}
    </OpsPage>
  );
}
