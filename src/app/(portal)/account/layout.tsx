import Link from "next/link";
import { getPortalViewer } from "@/lib/current-viewer";
import { PageHeader } from "@/components/ds/page-header";
import { PLAN_TIER_LABEL } from "@/lib/labels";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getPortalViewer();
  const plan = PLAN_TIER_LABEL[viewer.client.planTier] ?? viewer.client.planTier;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`${viewer.client.name} · ${plan} plan`}
        title="Account"
        tabsLabel="Account sections"
        tabs={[
          { label: "Overview", href: "/account" },
          { label: "Usage", href: "/account/usage" },
          { label: "Billing", href: "/account/billing" },
          { label: "Team", href: "/account/team" },
          { label: "Security", href: "/account/security" },
        ]}
      />
      {children}
      {/* Help left the main nav in Phase J; it lives here. */}
      <p className="m-0 text-[13px] text-brand-ink-2">
        Need a hand?{" "}
        <Link href="/help" className="text-brand-ink underline underline-offset-4">
          Help &amp; support
        </Link>
      </p>
    </div>
  );
}
