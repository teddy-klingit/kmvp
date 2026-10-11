import Link from "next/link";
import { getPortalViewer } from "@/lib/current-viewer";
import { SettingsHeader } from "@/components/portal/settings-header";
import { PLAN_TIER_LABEL } from "@/lib/labels";

/** Settings → Account & team: the plan, who's on the team, and sign-in security. */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getPortalViewer();
  const plan = PLAN_TIER_LABEL[viewer.client.planTier] ?? viewer.client.planTier;
  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader
        eyebrow={`${viewer.client.name} · ${plan} plan`}
        title="Account & team"
        chipsLabel="Account sections"
        chips={[
          { label: "Profile & plan", href: "/settings/account" },
          { label: "Team", href: "/settings/account/team" },
          { label: "Security", href: "/settings/account/security" },
        ]}
      />
      {children}
      <p className="m-0 text-[13px] text-brand-ink-2">
        Need a hand?{" "}
        <Link href="/help" className="text-brand-ink underline underline-offset-4">
          Help &amp; support
        </Link>
      </p>
    </div>
  );
}
