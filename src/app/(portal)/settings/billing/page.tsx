import Link from "next/link";
import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { SectionCard } from "@/components/ds/card";
import { SettingsHeader } from "@/components/portal/settings-header";
import { BillingForm } from "@/components/portal/settings/billing-form";
import { billingProfile } from "@/lib/invoicing";

/**
 * Settings → Billing details (Phase S): Klingit invoices, it never takes a card. Admins edit who and where to
 * invoice; payment terms and VAT are set with Klingit. Members see it read-only.
 */
export default async function BillingDetailsPage() {
  const viewer = await getPortalViewer();
  const admin = isClientAdmin(viewer);
  const p = await billingProfile(viewer.clientId);
  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader eyebrow={admin ? "Admins edit · invoices only, no card" : "Read-only · ask an admin to change it"} title="Billing details" />
      <div className="flex max-w-[760px] flex-col gap-6">
        <SectionCard title="Invoice to">
          <BillingForm profile={p} admin={admin} />
        </SectionCard>
        <SectionCard title="Terms">
          <dl className="m-0 flex flex-col gap-2 px-6 py-5 text-[14px]">
            <div className="flex justify-between gap-3">
              <dt className="text-brand-ink-2">Payment terms</dt>
              <dd className="m-0">{p.paymentTermsDays} days</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-brand-ink-2">VAT</dt>
              <dd className="m-0">{p.vatRate > 0 ? `${Math.round(p.vatRate * 100)}%` : "Reverse charge"}</dd>
            </div>
          </dl>
          <p className="m-0 border-t border-brand-line px-6 py-4 text-[13px] text-brand-ink-2">
            Set with Klingit. Your invoices are under <Link href="/settings/usage#billing">Usage → Billing</Link>.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
