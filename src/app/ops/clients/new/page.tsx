import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { SectionCard, CardBody } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { Field, fieldClass } from "@/components/ops/form-field";
import { createClientAction } from "@/lib/actions/ops-new-client-actions";
import { PLAN_TIER_LABEL, INTERNAL_ROLE_LABEL } from "@/lib/labels";

export default async function NewClientPage() {
  const staff = await prisma.staffMember.findMany({ include: { user: true } });

  return (
    <OpsPage>
      <PageHeader back={{ href: "/ops/clients", label: "Clients" }} eyebrow={`${staff.length} staff available as lead`} title="New client" />

      <form action={createClientAction} className="flex max-w-[640px] flex-col gap-6">
        <SectionCard title="Account">
          <CardBody className="flex flex-col gap-5">
            <Field label="Client name" htmlFor="name">
              <input id="name" name="name" required placeholder="e.g. Northvolt" className={fieldClass} />
            </Field>
            <Field label="Industry" htmlFor="industry">
              <input id="industry" name="industry" placeholder="e.g. Battery tech / Energy" className={fieldClass} />
            </Field>
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-1.5 p-0 text-[13px] text-brand-ink-2">Plan tier</legend>
              <div className="flex flex-wrap gap-2">
                {(["STARTER", "GROWTH", "SCALE"] as const).map((tier, i) => (
                  <label
                    key={tier}
                    className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-brand-outline bg-white px-4 text-[13px] has-[:checked]:border-brand-ink has-[:checked]:bg-brand-ink has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-ink has-[:focus-visible]:ring-offset-1 sm:h-9"
                  >
                    <input type="radio" name="planTier" value={tier} defaultChecked={i === 1} className="sr-only" />
                    {PLAN_TIER_LABEL[tier]}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Account lead" htmlFor="accountLeadId">
              <select id="accountLeadId" name="accountLeadId" className={fieldClass}>
                <option value="">Unassigned</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.user.name} · {INTERNAL_ROLE_LABEL[s.title]}
                  </option>
                ))}
              </select>
            </Field>
          </CardBody>
        </SectionCard>

        <SectionCard title="Primary contact" meta={<span className="text-[12px] text-brand-mute">Optional</span>}>
          <CardBody className="flex flex-col gap-5">
            <p className="m-0 text-[14px] leading-[1.5] text-brand-ink-2">
              We&apos;ll invite them as the client-side account owner. You can also add this later from Admin.
            </p>
            <Field label="Name" htmlFor="contactName">
              <input id="contactName" name="contactName" className={fieldClass} />
            </Field>
            <Field label="Email" htmlFor="contactEmail">
              <input id="contactEmail" name="contactEmail" type="email" className={fieldClass} />
            </Field>
          </CardBody>
        </SectionCard>

        <Button type="submit" variant="primary" size="lg" className="self-start">
          Create client
        </Button>
      </form>
    </OpsPage>
  );
}
