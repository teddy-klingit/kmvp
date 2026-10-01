import { redirect } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getOpsViewer } from "@/lib/current-viewer";
import { roleTierFor } from "@/lib/role-tier";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/shared/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { PriceListItemDialog } from "@/components/ops/price-list-item-dialog";
import { deletePriceListItemAction } from "@/lib/actions/price-list-actions";

const TIER_LABEL = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" } as const;
const TIER_TONE = { LOW: "neutral", MEDIUM: "info", HIGH: "warning" } as const;

export default async function PriceListPage() {
  const viewer = await getOpsViewer();
  const tier = roleTierFor(viewer.title);
  if (tier !== "ADMIN" && tier !== "PM") redirect("/ops");

  const items = await prisma.priceListItem.findMany({
    orderBy: [{ deliverableType: "asc" }, { complexityTier: "asc" }],
  });

  return (
    <OpsPage>
      <div className="flex flex-col gap-6">
        <PageHeader title="Price List" actions={<PriceListItemDialog />} />

        <Card className="flex items-start gap-3 bg-warning-soft p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-ink" />
          <div>
            <p className="text-sm font-bold text-ink">DRAFT — pending real pricing review</p>
            <p className="text-sm text-muted-foreground">
              These credit costs are illustrative placeholder values for scoping estimates internally — not final,
              not client-facing pricing. Replace them with reviewed rates before relying on this for anything
              client-facing.
            </p>
          </div>
        </Card>

        <div className="flex flex-col gap-3">
          <SectionLabel>{items.length} deliverable{items.length === 1 ? "" : "s"} priced</SectionLabel>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deliverable type</TableHead>
                <TableHead>Complexity tier</TableHead>
                <TableHead>Credit cost</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.deliverableType}</TableCell>
                  <TableCell>
                    <Badge tone={TIER_TONE[item.complexityTier]}>{TIER_LABEL[item.complexityTier]}</Badge>
                  </TableCell>
                  <TableCell>{item.creditCost}c</TableCell>
                  <TableCell className="text-muted-foreground">{item.notes ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <PriceListItemDialog item={item} />
                      <form action={deletePriceListItemAction}>
                        <input type="hidden" name="id" value={item.id} />
                        <Button type="submit" size="icon" variant="secondary" title="Delete">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    No price list rows yet — add one above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </OpsPage>
  );
}
