import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SectionCard, CardBody, CardNote } from "@/components/ds/card";
import { DataTable } from "@/components/ds/data-table";
import { StatusPill } from "@/components/ds/status-pill";
import { Button } from "@/components/ds/button";
import { Field, fieldClass } from "@/components/ops/form-field";
import { ExternalLink } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { createClientAppAction } from "@/lib/actions/client-app-actions";
import { BuildWithAiPrompt } from "@/components/ops/build-with-ai-prompt";

const short = (d: Date) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

export default async function ClientCustomAppsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) notFound();

  const apps = await prisma.clientApp.findMany({
    where: { clientId },
    include: { createdByStaff: { include: { user: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <BuildWithAiPrompt />

      <SectionCard title="Publish an app to this client">
        <CardBody>
          <form action={createClientAppAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input type="hidden" name="clientId" value={clientId} />
            <Field label="App name" htmlFor="name">
              <input id="name" name="name" placeholder="e.g. Campaign Tracker" required className={fieldClass} />
            </Field>
            <Field label="Hosted URL" htmlFor="hostedUrl">
              <input id="hostedUrl" name="hostedUrl" type="url" placeholder="https://…" required className={fieldClass} />
            </Field>
            <Field label="Description (optional)" htmlFor="description" className="sm:col-span-2">
              <input id="description" name="description" placeholder="What this app does for the client" className={fieldClass} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" variant="primary">
                Publish app
              </Button>
            </div>
          </form>
        </CardBody>
      </SectionCard>

      <SectionCard title="Published apps" meta={<span className="font-brand-mono text-[12px] text-brand-ink-2">{apps.length}</span>}>
        <DataTable
          label="Custom apps"
          empty={<CardNote>No custom apps published to this client yet.</CardNote>}
          columns={[
            { key: "app", label: "App" },
            { key: "url", label: "Hosted URL" },
            { key: "status", label: "Status" },
            { key: "owner", label: "Owner" },
            { key: "created", label: "Created" },
            { key: "updated", label: "Updated" },
          ]}
          rows={apps.map((app) => ({
            id: app.id,
            href: `/ops/clients/${clientId}/custom-apps/${app.id}`,
            cells: {
              app: (
                <span className="flex flex-col">
                  <span className="text-[15px]">{app.name}</span>
                  {(app.description || app.slug) && <span className="text-[12px] text-brand-ink-2">{app.description ?? app.slug}</span>}
                </span>
              ),
              url: (
                <a
                  href={app.hostedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative z-10 inline-flex max-w-[220px] items-center gap-1 text-[13px] text-brand-ink-2 hover:text-brand-ink"
                >
                  <span className="truncate">{app.hostedUrl.replace(/^https?:\/\//, "")}</span>
                  <ExternalLink className="size-3 shrink-0" strokeWidth={1.75} />
                </a>
              ),
              status: <StatusPill tone={app.status === "ACTIVE" ? "success" : "neutral"}>{app.status === "ACTIVE" ? "Running" : "Archived"}</StatusPill>,
              owner: app.createdByStaff ? <span className="text-[13px]">{app.createdByStaff.user.name}</span> : null,
              created: <span className="whitespace-nowrap text-[13px] text-brand-ink-2">{short(app.createdAt)}</span>,
              updated: <span className="whitespace-nowrap text-[13px] text-brand-ink-2">{short(app.updatedAt)}</span>,
            },
          }))}
        />
      </SectionCard>
    </>
  );
}
