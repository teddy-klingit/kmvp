import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { SectionCard, CardBody } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { Field, fieldClass } from "@/components/ops/form-field";
import { createOpsProjectAction } from "@/lib/actions/ops-new-project-actions";
import { PROJECT_TYPE_LABEL } from "@/lib/labels";

export default async function NewOpsProjectPage() {
  const clients = await prisma.client.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } });

  return (
    <OpsPage>
      <PageHeader
        back={{ href: "/ops/projects", label: "Projects" }}
        eyebrow={`${clients.length} active client${clients.length === 1 ? "" : "s"}`}
        title="Start a new project"
      />
      <SectionCard title="Project" className="max-w-[640px]">
        <CardBody>
          <form action={createOpsProjectAction} className="flex flex-col gap-5">
            <Field label="Client" htmlFor="clientId">
              <select id="clientId" name="clientId" required className={fieldClass}>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Project type" htmlFor="type">
              <select id="type" name="type" defaultValue="CAMPAIGN" className={fieldClass}>
                {Object.entries(PROJECT_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Project name" htmlFor="name">
              <input id="name" name="name" required placeholder="e.g. Investor deck, Winter campaign, App onboarding video" className={fieldClass} />
            </Field>
            <Field label="Target delivery date" htmlFor="dueDate">
              <input id="dueDate" name="dueDate" type="date" className={`${fieldClass} sm:w-48`} />
            </Field>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-brand-line pt-5">
              <p className="m-0 min-w-0 flex-1 basis-[260px] text-[13px] leading-[1.5] text-brand-ink-2">
                This starts the project at Brief. The client is prompted to complete it, or you can fill it in on their behalf from the Brief step.
              </p>
              <Button type="submit" variant="primary" size="lg">
                Create project
              </Button>
            </div>
          </form>
        </CardBody>
      </SectionCard>
    </OpsPage>
  );
}
