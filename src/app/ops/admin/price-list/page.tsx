import { AdminSection } from "@/components/ops/admin/admin-section";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOpsPage } from "@/lib/authz";
import { PageHeader } from "@/components/ds/page-header";
import { FilterChips } from "@/components/ds/filter-chips";
import { Card, SectionCard } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";
import { PRICE_LIST_TABS } from "@/components/ops/price-list-tabs";
import { addPriceListItemAction, archivePriceListItemAction, savePriceListItemAction } from "@/lib/actions/price-list-actions";
import { cn } from "@/lib/utils";

const STATUS = {
  fixed: { label: "Fixed", note: "used as is" },
  estimate: { label: "Estimate", note: "the PM confirms the number" },
  quote: { label: "Quote", note: "the PM quotes it" },
  legacy: { label: "Legacy", note: "staff reference only, hidden from clients" },
} as const;
type Status = keyof typeof STATUS;
const field = "h-8 rounded-[8px] border border-brand-outline bg-white px-2 text-[13px] outline-none focus:border-brand-ink";

/**
 * Price List → Deliverables (Phase S step 3): fixed credits per deliverable from klingit-price-list-credits-2026.csv,
 * with status, balance, lead time, client visibility and version, edited inline. Performance items are monthly
 * fixed-credit services (per month: to confirm). "Used in" counts the estimates that priced from an item.
 */
export default async function PriceListPage({ searchParams }: { searchParams: Promise<{ category?: string; status?: string }> }) {
  await requireOpsPage(["ADMIN", "PM"]);
  const q = await searchParams;
  const [items, used] = await Promise.all([
    prisma.priceListItem.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }] }),
    prisma.estimateLineItem.groupBy({ by: ["priceListItemId", "estimateId"], where: { priceListItemId: { not: null } } }),
  ]);
  const usedIn = new Map<string, number>();
  for (const u of used) usedIn.set(u.priceListItemId!, (usedIn.get(u.priceListItemId!) ?? 0) + 1);
  const categories = [...new Set(items.map((i) => i.category ?? "Other"))];
  const status = (q.status && q.status in STATUS ? q.status : null) as Status | null;
  const visible = items.filter((i) => (!q.category || (i.category ?? "Other") === q.category) && (!status || i.status === status));
  const href = (patch: Record<string, string | null>) => {
    const s = new URLSearchParams(Object.entries({ category: q.category ?? null, status: q.status ?? null, ...patch }).filter((e): e is [string, string] => Boolean(e[1])));
    return `/ops/admin/price-list${s.size ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <AdminSection note={`${items.length} items · ${categories.length} categories · 1 credit ≈ 1 hour`} chips={PRICE_LIST_TABS} current="/ops/admin/price-list" />
      <FilterChips label="Category" items={[{ label: "All", href: href({ category: null }), active: !q.category }, ...categories.map((c) => ({ label: c, href: href({ category: c }), active: q.category === c, count: items.filter((i) => (i.category ?? "Other") === c).length }))]} />
      <FilterChips label="Status" items={[{ label: "Any status", href: href({ status: null }), active: !status }, ...(Object.keys(STATUS) as Status[]).map((s) => ({ label: STATUS[s].label, href: href({ status: s }), active: status === s, count: items.filter((i) => i.status === s).length }))]} />
      <Card tone="muted" className="flex flex-wrap items-center gap-3 px-6 py-4 text-[13px] leading-[1.5] text-brand-ink-2">
        <PlaceholderTag />
        <span className="min-w-0 flex-1">
          Credits are the value price: an estimate line is quantity × credits, never hours × a multiplier. Estimate items wait for the PM&apos;s number and quote items for a PM quote before an estimate can be sent. Changing credits, unit, balance or status makes a new version.
        </span>
      </Card>

      <SectionCard title="Deliverables" meta={<span className="text-[13px] text-brand-ink-2">{visible.length} shown</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-brand-ink-2">
                {["Item", "Credits", "Unit", "Balance", "Status", "Lead time", "Clients", "Version", "Used in", ""].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2.5 font-medium first:pl-6 last:pr-6">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => {
                const form = `pl-${i.id}`;
                const toConfirm = i.monthly && i.category === "Performance";
                return (
                  <tr key={i.id} className={cn("border-t border-brand-line align-top", i.status === "legacy" && "text-brand-ink-2")}>
                    <td className="py-2.5 pl-6 pr-3">
                      <form id={form} action={savePriceListItemAction} />
                      <input type="hidden" name="id" value={i.id} form={form} />
                      <span className="flex flex-col gap-1">
                        <span className="text-[14px] text-brand-ink">{i.displayName ?? i.deliverableType}</span>
                        <span className="text-[12px] text-brand-ink-2">{[i.category, i.squad].filter(Boolean).join(" · ")}</span>
                        <span className="flex flex-wrap gap-1.5">
                          {i.monthly && <Tag>Monthly service</Tag>}
                          {toConfirm && <Tag tone="orange">Per month: to confirm</Tag>}
                          {i.sourceKey === "web_retainer" && <Tag tone="orange">Flagged: new item</Tag>}
                        </span>
                        <input name="notes" form={form} defaultValue={i.notes ?? ""} placeholder="Notes" aria-label="Notes" className={cn(field, "w-full min-w-[220px] text-brand-ink-2")} />
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <input name="creditCost" form={form} defaultValue={i.creditCost ?? ""} placeholder={i.status === "quote" ? "quote" : "—"} inputMode="decimal" aria-label="Credits" className={cn(field, "w-16 text-right tabular-nums")} />
                    </td>
                    <td className="px-3 py-2.5">
                      <input name="unit" form={form} defaultValue={i.unit ?? ""} aria-label="Unit" className={cn(field, "w-28")} />
                    </td>
                    <td className="px-3 py-2.5">
                      <select name="balance" form={form} defaultValue={i.balance} aria-label="Balance" className={cn(field, "w-24")}>
                        <option value="creative">Creative</option>
                        <option value="pm">PM</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <select name="status" form={form} defaultValue={i.status} aria-label="Status" title={STATUS[i.status as Status]?.note} className={cn(field, "w-24")}>
                        {(Object.keys(STATUS) as Status[]).map((s) => (
                          <option key={s} value={s}>
                            {STATUS[s].label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-1 text-[12px] text-brand-ink-2">
                        <input name="leadTimeDays" form={form} defaultValue={i.leadTimeDays ?? ""} placeholder="—" inputMode="numeric" aria-label="Lead time in working days" className={cn(field, "w-12 text-right")} /> days
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <input name="visibleToClients" form={form} type="checkbox" defaultChecked={i.visibleToClients} disabled={i.status === "legacy"} aria-label="Visible to clients" className="mt-2 size-4" />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-brand-ink-2">
                      v{i.version}
                      <br />
                      {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(i.validFrom)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{usedIn.get(i.id) ?? 0}</td>
                    <td className="py-2.5 pl-3 pr-6">
                      <span className="flex flex-col items-end gap-1.5">
                        <button type="submit" form={form} className="text-[13px] underline underline-offset-2">
                          Save
                        </button>
                        <form action={archivePriceListItemAction}>
                          <input type="hidden" name="id" value={i.id} />
                          <button type="submit" className="text-[12px] text-brand-ink-2 underline underline-offset-2">
                            Remove
                          </button>
                        </form>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Add an item">
        <form action={addPriceListItemAction} className="flex flex-wrap items-end gap-3 px-6 py-5 text-[12px] text-brand-ink-2">
          <label className="flex min-w-[240px] flex-1 flex-col gap-1">
            Item
            <input name="item" required className={cn(field, "h-9")} />
          </label>
          <label className="flex flex-col gap-1">
            Category
            <input name="category" list="pl-categories" className={cn(field, "h-9 w-48")} />
            <datalist id="pl-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1">
            Squad
            <input name="squad" className={cn(field, "h-9 w-32")} />
          </label>
          <label className="flex flex-col gap-1">
            Credits
            <input name="creditCost" inputMode="decimal" className={cn(field, "h-9 w-20")} />
          </label>
          <label className="flex flex-col gap-1">
            Unit
            <input name="unit" placeholder="per post" className={cn(field, "h-9 w-28")} />
          </label>
          <label className="flex flex-col gap-1">
            Status
            <select name="status" className={cn(field, "h-9 w-28")}>
              {(Object.keys(STATUS) as Status[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS[s].label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Balance
            <select name="balance" className={cn(field, "h-9 w-28")}>
              <option value="creative">Creative</option>
              <option value="pm">PM</option>
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2">
            <input name="monthly" type="checkbox" className="size-4" /> Monthly service
          </label>
          <Button type="submit" variant="primary" size="sm">
            Add item
          </Button>
        </form>
      </SectionCard>
      <p className="m-0 text-[12px] text-brand-ink-2">
        Plans, packs, currencies and the custom-quote multipliers are on the other tabs. Source: <code>data/pricing/klingit-price-list-credits-2026.csv</code>. <Link href="/ops/admin/price-list/currencies">Currencies & terms</Link>
      </p>
    </div>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: "orange" }) {
  return <span className={cn("rounded-[6px] px-1.5 py-0.5 font-brand-mono text-[10px] uppercase", tone === "orange" ? "border border-dashed border-brand-orange text-brand-orange-text" : "bg-brand-chip text-brand-ink-2")}>{children}</span>;
}
