import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { PageGrid } from "@/components/ds/page-grid";
import { SectionCard, CardRows } from "@/components/ds/card";
import { Avatar } from "@/components/ds/avatar";
import { TwoFactorCard } from "@/components/shared/two-factor-card";
import { getOpsViewer } from "@/lib/current-viewer";
import { INTERNAL_ROLE_LABEL } from "@/lib/labels";
import { hasAdmin } from "@/lib/role-tier";
import { saveBookingUrlAction } from "@/lib/actions/pm-message-actions";

/** Agency pages that left the main nav in Phase J. Admin only, like before. */
const AGENCY_LINKS = [
  { label: "Billing", href: "/ops/admin/billing", note: "Invoices and plans across clients" },
  { label: "Analytics", href: "/ops/analytics", note: "Delivery, margins and client health" },
  { label: "Settings", href: "/ops/admin/settings", note: "Integrations and agency defaults" },
];

export default async function OpsAccountPage() {
  const viewer = await getOpsViewer();
  const admin = hasAdmin(viewer);

  return (
    <OpsPage>
      <PageHeader eyebrow={INTERNAL_ROLE_LABEL[viewer.title]} title="Account" />
      <PageGrid
        main={
          <>
            <SectionCard title="Profile">
              <div className="flex items-center gap-4 px-6 py-5">
                <Avatar name={viewer.user.name} size={48} />
                <div className="flex min-w-0 flex-col">
                  <span className="text-[16px]">{viewer.user.name}</span>
                  <span className="text-[14px] text-brand-ink-2">{viewer.user.email}</span>
                </div>
              </div>
            </SectionCard>
            <SectionCard title="Book a call">
              <form action={saveBookingUrlAction} className="flex flex-wrap items-end gap-3 px-6 py-5">
                <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-[13px] text-brand-ink-2">
                  Your booking link (Calendly, Google Calendar…). Your clients see “Book a call” in their message panel.
                  <input name="bookingUrl" type="url" defaultValue={viewer.bookingUrl ?? ""} placeholder="https://" className="h-10 rounded-[10px] border border-[#CFC8B8] bg-white px-3 text-[14px] text-brand-ink outline-none focus:border-brand-ink" />
                </label>
                <button type="submit" className="inline-flex h-10 items-center rounded-full bg-brand-ink px-4 font-brand-mono text-[12px] text-white">
                  Save
                </button>
              </form>
            </SectionCard>
            <TwoFactorCard enabled={viewer.user.twoFactorEnabled} path="/ops/account" />
          </>
        }
        side={
          admin ? (
            <SectionCard title="Agency">
              <CardRows>
                {AGENCY_LINKS.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="flex min-h-11 items-center gap-3 px-6 py-3.5 text-brand-ink no-underline hover:bg-brand-chip">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[15px]">{l.label}</span>
                        <span className="text-[12px] text-brand-ink-2">{l.note}</span>
                      </span>
                      <ArrowRight className="size-4" strokeWidth={1.75} />
                    </Link>
                  </li>
                ))}
              </CardRows>
            </SectionCard>
          ) : undefined
        }
      />
    </OpsPage>
  );
}
