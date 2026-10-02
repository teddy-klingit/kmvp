import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SectionCard, CardBody } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { Button } from "@/components/ds/button";
import { PillLink, monoLink } from "@/components/ds/pill-link";
import { Field, fieldClass } from "@/components/ops/form-field";
import { ExternalLink } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { updateClientAppAction, archiveClientAppAction, reactivateClientAppAction } from "@/lib/actions/client-app-actions";

export default async function ClientAppDetailPage({ params }: { params: Promise<{ clientId: string; appId: string }> }) {
  const { clientId, appId } = await params;
  const app = await prisma.clientApp.findUnique({
    where: { id: appId },
    include: { client: true, createdByStaff: { include: { user: true } } },
  });
  if (!app || app.clientId !== clientId) notFound();

  const facts: { label: string; value: React.ReactNode }[] = [
    { label: "App ID", value: <span className="block truncate font-brand-mono text-[12px]">{app.id}</span> },
    ...(app.slug ? [{ label: "Slug", value: <span className="font-brand-mono text-[12px]">{app.slug}</span> }] : []),
    ...(app.createdByStaff ? [{ label: "Owner", value: app.createdByStaff.user.name }] : []),
    { label: "Client", value: app.client.name },
    {
      label: "Hosted URL",
      value: (
        <a href={app.hostedUrl} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1 text-brand-ink underline underline-offset-4 hover:no-underline">
          <span className="truncate">{app.hostedUrl.replace(/^https?:\/\//, "")}</span>
          <ExternalLink className="size-3 shrink-0" strokeWidth={1.75} />
        </a>
      ),
    },
    { label: "Created", value: formatDate(app.createdAt) },
    { label: "Last revised", value: formatDate(app.updatedAt) },
  ];

  return (
    <>
      <SectionCard
        title={app.name}
        meta={<StatusPill tone={app.status === "ACTIVE" ? "success" : "neutral"}>{app.status === "ACTIVE" ? "Running" : "Archived"}</StatusPill>}
        action={
          <Link href={`/ops/clients/${clientId}/custom-apps`} className={monoLink}>
            ALL APPS
          </Link>
        }
      >
        <CardBody className="flex flex-col gap-5">
          {app.description && <p className="m-0 text-[15px] leading-[1.5] text-brand-ink-2">{app.description}</p>}
          <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((f) => (
              <div key={f.label} className="flex min-w-0 flex-col gap-1">
                <dt className="text-[12px] text-brand-mute">{f.label}</dt>
                <dd className="m-0 min-w-0 text-[14px]">{f.value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-2 border-t border-brand-line pt-5">
            <PillLink href={app.hostedUrl} external variant="primary" arrow>
              Open app
            </PillLink>
            <form action={app.status === "ACTIVE" ? archiveClientAppAction : reactivateClientAppAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="appId" value={app.id} />
              <Button type="submit" variant="secondary" size="lg" className={app.status === "ACTIVE" ? "text-ds-danger-text hover:border-ds-danger-text" : undefined}>
                {app.status === "ACTIVE" ? "Archive app" : "Reactivate app"}
              </Button>
            </form>
          </div>
        </CardBody>
      </SectionCard>

      <SectionCard title="Edit details">
        <CardBody>
          <form action={updateClientAppAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input type="hidden" name="clientId" value={clientId} />
            <input type="hidden" name="appId" value={app.id} />
            <Field label="App name" htmlFor="name">
              <input id="name" name="name" defaultValue={app.name} required className={fieldClass} />
            </Field>
            <Field label="Hosted URL" htmlFor="hostedUrl">
              <input id="hostedUrl" name="hostedUrl" type="url" defaultValue={app.hostedUrl} required className={fieldClass} />
            </Field>
            <Field label="Description" htmlFor="description" className="sm:col-span-2">
              <input id="description" name="description" defaultValue={app.description ?? ""} className={fieldClass} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" variant="secondary">
                Save changes
              </Button>
            </div>
          </form>
        </CardBody>
      </SectionCard>
    </>
  );
}
