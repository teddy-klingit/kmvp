import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/shared/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClientAction } from "@/lib/actions/ops-new-client-actions";
import { PLAN_TIER_LABEL, INTERNAL_ROLE_LABEL } from "@/lib/labels";

export default async function NewClientPage() {
  const staff = await prisma.staffMember.findMany({ include: { user: true } });

  return (
    <OpsPage>
      <div className="flex max-w-xl flex-col gap-6">
        <PageHeader title="New client" actions={<div />} />

        <form action={createClientAction} className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <SectionLabel>Account</SectionLabel>
            <Card className="flex flex-col gap-4 p-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Client name</Label>
                <Input id="name" name="name" required placeholder="e.g. Northvolt" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="industry">Industry</Label>
                <Input id="industry" name="industry" placeholder="e.g. Battery tech / Energy" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Plan tier</Label>
                <div className="flex gap-2">
                  {(["STARTER", "GROWTH", "SCALE"] as const).map((tier, i) => (
                    <label key={tier} className="flex items-center gap-1.5 text-sm">
                      <input type="radio" name="planTier" value={tier} defaultChecked={i === 1} />
                      {PLAN_TIER_LABEL[tier]}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="accountLeadId">Account lead</Label>
                <select
                  id="accountLeadId"
                  name="accountLeadId"
                  className="h-9 rounded-md border border-input bg-card px-3 text-sm"
                >
                  <option value="">Unassigned</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.user.name} — {INTERNAL_ROLE_LABEL[s.title]}
                    </option>
                  ))}
                </select>
              </div>
            </Card>
          </div>

          <div className="flex flex-col gap-3">
            <SectionLabel>Primary contact (optional)</SectionLabel>
            <Card className="flex flex-col gap-4 p-5">
              <p className="text-sm text-muted-foreground">
                We&apos;ll invite them as the client-side account owner. You can also add this later from Admin.
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contactName">Name</Label>
                <Input id="contactName" name="contactName" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contactEmail">Email</Label>
                <Input id="contactEmail" name="contactEmail" type="email" />
              </div>
            </Card>
          </div>

          <Button type="submit" className="self-start">
            Create client
          </Button>
        </form>
      </div>
    </OpsPage>
  );
}
