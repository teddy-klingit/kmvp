import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/shared/page-header";
import { NavTabs } from "@/components/ui/nav-tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ExternalLink } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { createClientAppAction } from "@/lib/actions/client-app-actions";
import { BuildWithAiPrompt } from "@/components/ops/build-with-ai-prompt";

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
    <OpsPage>
      <div className="flex flex-col gap-6">
        <PageHeader title={`${client.name} — Custom apps`} actions={<div />} />
        <NavTabs
          items={[
            { label: "Workspace", href: `/ops/clients/${clientId}/dashboard` },
            { label: "Admin", href: `/ops/clients/${clientId}/admin` },
            { label: "Brand OS", href: `/ops/clients/${clientId}/brand-os` },
            { label: "Custom apps", href: `/ops/clients/${clientId}/custom-apps` },
            { label: "Content plan", href: `/ops/clients/${clientId}/content-plan` },
          ]}
        />

        <BuildWithAiPrompt />

        <Card className="p-5">
          <p className="mb-3 text-sm font-medium">Publish an app to this client</p>
          <form action={createClientAppAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input type="hidden" name="clientId" value={clientId} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">App name</Label>
              <Input id="name" name="name" placeholder="e.g. Campaign Tracker" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hostedUrl">Hosted URL</Label>
              <Input id="hostedUrl" name="hostedUrl" type="url" placeholder="https://…" required />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input id="description" name="description" placeholder="What this app does for the client" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Publish app</Button>
            </div>
          </form>
        </Card>

        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Showing {apps.length} app{apps.length === 1 ? "" : "s"}.
          </p>
          {apps.length === 0 ? (
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">No custom apps published to this client yet.</p>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>App</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Hosted URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apps.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell>
                      <Link href={`/ops/clients/${clientId}/custom-apps/${app.id}`} className="font-medium text-ink hover:underline">
                        {app.name}
                      </Link>
                      {app.description && <p className="text-xs text-muted-foreground">{app.description}</p>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{app.slug ?? "—"}</TableCell>
                    <TableCell>
                      <a
                        href={app.hostedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {app.hostedUrl.replace(/^https?:\/\//, "")}
                        <ExternalLink className="size-3" />
                      </a>
                    </TableCell>
                    <TableCell>
                      <Badge tone={app.status === "ACTIVE" ? "success" : "neutral"}>{app.status === "ACTIVE" ? "Running" : "Archived"}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{app.createdByStaff?.user.name ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(app.createdAt)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(app.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </OpsPage>
  );
}
