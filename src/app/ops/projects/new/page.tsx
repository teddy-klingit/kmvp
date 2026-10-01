import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createOpsProjectAction } from "@/lib/actions/ops-new-project-actions";
import { PROJECT_TYPE_LABEL } from "@/lib/labels";

export default async function NewOpsProjectPage() {
  const clients = await prisma.client.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } });

  return (
    <OpsPage>
      <div className="flex max-w-lg flex-col gap-6">
        <PageHeader title="Start a new project" actions={<div />} />
        <Card className="p-5">
          <form action={createOpsProjectAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="clientId">Client</Label>
              <select
                id="clientId"
                name="clientId"
                required
                className="h-9 rounded-md border border-input bg-card px-3 text-sm"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="type">Project type</Label>
              <select
                id="type"
                name="type"
                defaultValue="CAMPAIGN"
                className="h-9 rounded-md border border-input bg-card px-3 text-sm"
              >
                {Object.entries(PROJECT_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Project name</Label>
              <Input id="name" name="name" required placeholder="e.g. Investor deck, Winter campaign, App onboarding video" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dueDate">Target delivery date</Label>
              <Input id="dueDate" name="dueDate" type="date" className="w-48" />
            </div>
            <p className="text-xs text-muted-foreground">
              This starts the project at Brief — the client will be prompted to complete it, or you can fill it in
              on their behalf from the Brief tab.
            </p>
            <Button type="submit" className="self-start">
              Create project
            </Button>
          </form>
        </Card>
      </div>
    </OpsPage>
  );
}
