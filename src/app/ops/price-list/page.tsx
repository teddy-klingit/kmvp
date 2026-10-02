import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOpsViewer } from "@/lib/current-viewer";
import { roleTierFor } from "@/lib/role-tier";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { FilterChips } from "@/components/ds/filter-chips";
import { Card, SectionCard, CardNote } from "@/components/ds/card";
import { DataTable } from "@/components/ds/data-table";
import { StatusPill, type PillTone } from "@/components/ds/status-pill";
import { pillClass } from "@/components/ds/button";
import { PriceListItemDialog } from "@/components/ops/price-list-item-dialog";
import { deletePriceListItemAction } from "@/lib/actions/price-list-actions";

const TIER_LABEL = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" } as const;
const TIER_TONE: Record<string, PillTone> = { LOW: "neutral", MEDIUM: "success", HIGH: "watch" };

/** Ops → Price list (OpsClients pattern): header + tier chips + one card with the table. "Remove" archives a row; nothing is deleted. */
export default async function PriceListPage({ searchParams }: { searchParams: Promise<{ tier?: string }> }) {
  const viewer = await getOpsViewer();
  const role = roleTierFor(viewer.title);
  if (role !== "ADMIN" && role !== "PM") redirect("/ops");
  const { tier } = await searchParams;
  const items = await prisma.priceListItem.findMany({ where: { archivedAt: null }, orderBy: [{ deliverableType: "asc" }, { complexityTier: "asc" }] });
  const visible = tier && tier in TIER_LABEL ? items.filter((i) => i.complexityTier === tier) : items;
  const types = new Set(items.map((i) => i.deliverableType)).size;

  return (
    <OpsPage>
      <PageHeader eyebrow={`${types} deliverable${types === 1 ? "" : "s"} · ${items.length} prices`} title="Price list" actions={<PriceListItemDialog />} />
      <FilterChips
        label="Complexity"
        items={[
          { label: "All", href: "/ops/price-list", active: !tier },
          ...(["LOW", "MEDIUM", "HIGH"] as const).map((t) => ({ label: TIER_LABEL[t], href: `/ops/price-list?tier=${t}`, active: tier === t, count: items.filter((i) => i.complexityTier === t).length })),
        ]}
      />
      <Card tone="muted" className="px-6 py-4 text-[13px] leading-[1.5] text-brand-ink-2">
        <span className="text-[12px] text-brand-ink">Draft pricing</span> · These credit costs are internal placeholders for scoping estimates, pending a real pricing review. Not client-facing.
      </Card>
      <SectionCard title="All prices">
        <DataTable
          label="Price list"
          empty={<CardNote>No prices in this tier.</CardNote>}
          columns={[
            { key: "type", label: "Deliverable" },
            { key: "tier", label: "Complexity" },
            { key: "cost", label: "Credits", align: "right" },
            { key: "notes", label: "Notes" },
            { key: "actions", label: "", align: "right" },
          ]}
          rows={visible.map((item) => ({
            id: item.id,
            cells: {
              type: <span className="text-[15px]">{item.displayName ?? item.deliverableType}</span>,
              tier: <StatusPill tone={TIER_TONE[item.complexityTier]}>{TIER_LABEL[item.complexityTier]}</StatusPill>,
              cost: `${item.creditCost}c`,
              notes: item.notes ? <span className="text-brand-ink-2">{item.notes}</span> : null,
              actions: (
                <span className="flex justify-end gap-2">
                  <PriceListItemDialog item={item} />
                  <form action={deletePriceListItemAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" className={pillClass("secondary", "sm")}>
                      Remove
                    </button>
                  </form>
                </span>
              ),
            },
          }))}
        />
      </SectionCard>
    </OpsPage>
  );
}
