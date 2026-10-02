import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/shared/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { updateClientAppAction, archiveClientAppAction, reactivateClientAppAction } from "@/lib/actions/client-app-actions";

export default async function ClientAppDetailPage({ params }: { params: Promise<{ clientId: string; appId: string }> }) {
  const { clientId, appId } = await params;
  const app = await prisma.clientApp.findUnique({
    where: { id: appId },
    include: { client: true, createdByStaff: { include: { user: true } } },
  });
  if (!app || app.clientId !== clientId) notFound();

  return (
    <OpsPage>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <PageHeader title={app.name} actions={<div />} />
          <Link href={`/ops/clients/${clientId}/custom-apps`} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" />
            Back to apps
          </Link>
        </div>
        <p className="-mt-4 text-sm text-muted-foreground">
          Slug {app.slug ?? "—"} · owner {app.createdByStaff?.user.name ?? "—"} · client {app.client.name}
        </p>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <SectionLabel>Overview</SectionLabel>
            <Badge tone={app.status === "ACTIVE" ? "success" : "neutral"}>{app.status === "ACTIVE" ? "Running" : "Archived"}</Badge>
          </div>
          <Card className="flex flex-col gap-4 p-5">
            {app.description && <p className="text-sm text-muted-foreground">{app.description}</p>}
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">App ID</p>
                <p className="truncate font-mono text-xs">{app.id}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Hosted URL</p>
                <a href={app.hostedUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 truncate text-ink hover:underline">
                  {app.hostedUrl.replace(/^https?:\/\//, "")} <ExternalLink className="size-3 shrink-0" />
                </a>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p>{formatDate(app.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last revised</p>
                <p>{formatDate(app.updatedAt)}</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Quick actions</SectionLabel>
          <Card className="flex items-center gap-2 p-5">
            <a href={app.hostedUrl} target="_blank" rel="noopener noreferrer">
              <Button type="button">Open app</Button>
            </a>
            <form action={app.status === "ACTIVE" ? archiveClientAppAction : reactivateClientAppAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="appId" value={app.id} />
              <Button type="submit" variant={app.status === "ACTIVE" ? "destructive" : "secondary"}>
                {app.status === "ACTIVE" ? "Archive app" : "Reactivate app"}
              </Button>
            </form>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Edit details</SectionLabel>
          <Card className="p-5">
            <form action={updateClientAppAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="appId" value={app.id} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">App name</Label>
                <Input id="name" name="name" defaultValue={app.name} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hostedUrl">Hosted URL</Label>
                <Input id="hostedUrl" name="hostedUrl" type="url" defaultValue={app.hostedUrl} required />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Input id="description" name="description" defaultValue={app.description ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" variant="secondary">Save changes</Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </OpsPage>
  );
}
