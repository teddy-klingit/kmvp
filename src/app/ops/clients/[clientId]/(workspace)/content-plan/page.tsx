import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils";
import {
  setContentPlanTargetAction,
  logBusinessOutcomeAction,
  createContentPostAction,
} from "@/lib/actions/content-calendar-actions";

export default async function ClientContentPlanPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) notFound();

  const [planTargets, outcomes, posts] = await Promise.all([
    prisma.contentPlanTarget.findMany({ where: { clientId }, orderBy: { platform: "asc" } }),
    prisma.clientBusinessOutcome.findMany({ where: { clientId }, orderBy: { periodStart: "desc" }, take: 10 }),
    prisma.contentPost.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <>
      <div className="flex flex-col gap-6">

        <div className="flex flex-col gap-3">
          <SectionLabel>Weekly plan targets</SectionLabel>
          <Card className="p-5">
            <form action={setContentPlanTargetAction} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <input type="hidden" name="clientId" value={clientId} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="platform">Platform</Label>
                <Input id="platform" name="platform" placeholder="e.g. LinkedIn" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="weeklyVolume">Posts / week</Label>
                <Input id="weeklyVolume" name="weeklyVolume" type="number" min={0} required />
              </div>
              <div className="flex items-end">
                <Button type="submit">Set target</Button>
              </div>
            </form>
          </Card>
          {planTargets.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {planTargets.map((t) => (
                <Card key={t.id} className="p-4">
                  <p className="text-lg font-semibold">
                    {t.weeklyVolume}
                    <span className="text-xs font-normal text-muted-foreground">/wk</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{t.platform}</p>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Log a business outcome</SectionLabel>
          <Card className="p-5">
            <form action={logBusinessOutcomeAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <input type="hidden" name="clientId" value={clientId} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="periodStart">Period start</Label>
                <Input id="periodStart" name="periodStart" type="date" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="periodEnd">Period end</Label>
                <Input id="periodEnd" name="periodEnd" type="date" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="revenue">Revenue</Label>
                <Input id="revenue" name="revenue" type="number" step="0.01" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="leadsGenerated">Leads generated</Label>
                <Input id="leadsGenerated" name="leadsGenerated" type="number" />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="note">Note (optional)</Label>
                <Input id="note" name="note" placeholder="Where this number came from" />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit">Log outcome</Button>
              </div>
            </form>
          </Card>
          {outcomes.length > 0 && (
            <Card className="divide-y divide-border p-0">
              {outcomes.map((o) => (
                <div key={o.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="text-muted-foreground">
                    {formatDate(o.periodStart)} – {formatDate(o.periodEnd)}
                  </span>
                  <span>
                    {o.revenue !== null ? `$${o.revenue.toLocaleString()}` : "—"}
                    {o.leadsGenerated !== null ? ` · ${o.leadsGenerated} leads` : ""}
                  </span>
                </div>
              ))}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Log a content post</SectionLabel>
          <Card className="p-5">
            <form action={createContentPostAction} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <input type="hidden" name="clientId" value={clientId} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="postTitle">Title</Label>
                <Input id="postTitle" name="title" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="postPlatform">Platform</Label>
                <Input id="postPlatform" name="platform" placeholder="e.g. Instagram" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contentType">Content type</Label>
                <Input id="contentType" name="contentType" placeholder="e.g. Reel" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="channelType">Channel type</Label>
                <select id="channelType" name="channelType" className="h-9 rounded-md border border-border bg-card px-3 text-sm">
                  <option value="ORGANIC">Organic</option>
                  <option value="PAID">Paid</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="postStatus">Status</Label>
                <select id="postStatus" name="status" className="h-9 rounded-md border border-border bg-card px-3 text-sm">
                  <option value="PLANNED">Planned</option>
                  <option value="PUBLISHED">Published</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="scheduledDate">Scheduled date</Label>
                <Input id="scheduledDate" name="scheduledDate" type="date" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="impressions">Impressions</Label>
                <Input id="impressions" name="impressions" type="number" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="engagementRate">Engagement rate %</Label>
                <Input id="engagementRate" name="engagementRate" type="number" step="0.1" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="videoViews">Video views</Label>
                <Input id="videoViews" name="videoViews" type="number" />
              </div>
              <div className="sm:col-span-3">
                <Button type="submit">Add post</Button>
              </div>
            </form>
          </Card>
          {posts.length > 0 && (
            <Card className="divide-y divide-border p-0">
              {posts.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.platform}
                      {p.contentType ? ` · ${p.contentType}` : ""}
                    </p>
                  </div>
                  <Badge tone={p.status === "PUBLISHED" ? "success" : "neutral"}>{p.status}</Badge>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
