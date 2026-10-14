"use client";

import { useActionState } from "react";
import { pillClass } from "@/components/ds/button";
import { saveBillingDetailsAction, type BillingState } from "@/lib/actions/billing-actions";

type Profile = { company: string | null; orgNumber: string | null; vatNumber: string | null; address: string | null; country: string; invoiceEmail: string | null; reference: string | null; eInvoiceAddress: string | null };
const field = "h-11 rounded-[10px] border border-brand-outline bg-white px-3 text-[15px] outline-none focus:border-brand-ink disabled:bg-brand-page";

/** Who and where Klingit invoices (Settings → Billing details). Admins edit; members read. */
export function BillingForm({ profile, admin }: { profile: Profile; admin: boolean }) {
  const [state, action, pending] = useActionState<BillingState, FormData>(saveBillingDetailsAction, {});
  const rows: { name: keyof Profile; label: string; placeholder?: string; wide?: boolean }[] = [
    { name: "company", label: "Company name" },
    { name: "orgNumber", label: "Org number", placeholder: "556123-4567" },
    { name: "vatNumber", label: "VAT number", placeholder: "SE556123456701" },
    { name: "country", label: "Country (2 letters)", placeholder: "SE" },
    { name: "address", label: "Invoice address", wide: true },
    { name: "invoiceEmail", label: "Invoice email", placeholder: "invoices@company.com" },
    { name: "reference", label: "Reference or PO number" },
    { name: "eInvoiceAddress", label: "E-invoice address (optional)", placeholder: "PEPPOL ID or GLN" },
  ];
  return (
    <form action={action} className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
      {rows.map((r) => (
        <label key={r.name} className={`flex flex-col gap-1.5 text-[13px] text-brand-ink-2 ${r.wide ? "sm:col-span-2" : ""}`}>
          {r.label}
          <input name={r.name} defaultValue={profile[r.name] ?? ""} placeholder={r.placeholder} disabled={!admin} className={field} />
        </label>
      ))}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        {admin && (
          <button type="submit" disabled={pending} className={pillClass("primary")}>
            {pending ? "Saving…" : "Save"}
          </button>
        )}
        {state.error && <span className="text-[13px] text-ds-danger-text">{state.error}</span>}
        {state.ok && <span className="text-[13px]">{state.ok}</span>}
      </div>
    </form>
  );
}
