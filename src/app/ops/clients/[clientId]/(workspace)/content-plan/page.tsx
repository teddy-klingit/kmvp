import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SectionCard, CardBody, CardRows } from "@/components/ds/card";
import { StatTiles } from "@/components/ds/stats";
import { StatusPill } from "@/components/ds/status-pill";
import { Button } from "@/components/ds/button";
import { Field, fieldClass } from "@/components/ops/form-field";
import { formatDate } from "@/lib/utils";
import {
  setContentPlanTargetAction,
  logBusinessOutcomeAction,
  createContentPostAction,
} from "@/lib/actions/content-calendar-actions";

const count = (n: number) => <span className="font-brand-mono text-[12px] text-brand-ink-2">{n}</span>;

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
      <SectionCard title="Weekly plan targets" meta={planTargets.length > 0 ? count(planTargets.length) : undefined}>
        {planTargets.length > 0 && <StatTiles className="border-b border-brand-line" tiles={planTargets.map((t) => ({ label: t.platform, value: `${t.weeklyVolume}/wk` }))} />}
        <CardBody>
          <form action={setContentPlanTargetAction} className="grid grid-cols-1 items-end gap-4 sm:grid-cols-3">
            <input type="hidden" name="clientId" value={clientId} />
            <Field label="Platform" htmlFor="platform">
              <input id="platform" name="platform" placeholder="e.g. LinkedIn" required className={fieldClass} />
            </Field>
            <Field label="Posts / week" htmlFor="weeklyVolume">
              <input id="weeklyVolume" name="weeklyVolume" type="number" min={0} required className={fieldClass} />
            </Field>
            <div>
              <Button type="submit" variant="primary">
                Set target
              </Button>
            </div>
          </form>
        </CardBody>
      </SectionCard>

      <SectionCard title="Business outcomes" meta={outcomes.length > 0 ? count(outcomes.length) : undefined}>
        <CardBody>
          <form action={logBusinessOutcomeAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input type="hidden" name="clientId" value={clientId} />
            <Field label="Period start" htmlFor="periodStart">
              <input id="periodStart" name="periodStart" type="date" required className={fieldClass} />
            </Field>
            <Field label="Period end" htmlFor="periodEnd">
              <input id="periodEnd" name="periodEnd" type="date" required className={fieldClass} />
            </Field>
            <Field label="Revenue" htmlFor="revenue">
              <input id="revenue" name="revenue" type="number" step="0.01" className={fieldClass} />
            </Field>
            <Field label="Leads generated" htmlFor="leadsGenerated">
              <input id="leadsGenerated" name="leadsGenerated" type="number" className={fieldClass} />
            </Field>
            <Field label="Note (optional)" htmlFor="note" className="sm:col-span-2">
              <input id="note" name="note" placeholder="Where this number came from" className={fieldClass} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" variant="primary">
                Log outcome
              </Button>
            </div>
          </form>
        </CardBody>
        {outcomes.length > 0 && (
          <CardRows className="border-t border-brand-line">
            {outcomes.map((o) => {
              const figures = [o.revenue !== null ? `$${o.revenue.toLocaleString()}` : null, o.leadsGenerated !== null ? `${o.leadsGenerated} leads` : null].filter(Boolean);
              return (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-6 py-3.5 text-[14px]">
                  <span className="text-brand-ink-2">
                    {formatDate(o.periodStart)} – {formatDate(o.periodEnd)}
                  </span>
                  {figures.length > 0 && <span className="tabular-nums">{figures.join(" · ")}</span>}
                </li>
              );
            })}
          </CardRows>
        )}
      </SectionCard>

      <SectionCard title="Content posts" meta={posts.length > 0 ? count(posts.length) : undefined}>
        <CardBody>
          <form action={createContentPostAction} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <input type="hidden" name="clientId" value={clientId} />
            <Field label="Title" htmlFor="postTitle">
              <input id="postTitle" name="title" required className={fieldClass} />
            </Field>
            <Field label="Platform" htmlFor="postPlatform">
              <input id="postPlatform" name="platform" placeholder="e.g. Instagram" required className={fieldClass} />
            </Field>
            <Field label="Content type" htmlFor="contentType">
              <input id="contentType" name="contentType" placeholder="e.g. Reel" className={fieldClass} />
            </Field>
            <Field label="Channel type" htmlFor="channelType">
              <select id="channelType" name="channelType" className={fieldClass}>
                <option value="ORGANIC">Organic</option>
                <option value="PAID">Paid</option>
              </select>
            </Field>
            <Field label="Status" htmlFor="postStatus">
              <select id="postStatus" name="status" className={fieldClass}>
                <option value="PLANNED">Planned</option>
                <option value="PUBLISHED">Published</option>
              </select>
            </Field>
            <Field label="Scheduled date" htmlFor="scheduledDate">
              <input id="scheduledDate" name="scheduledDate" type="date" className={fieldClass} />
            </Field>
            <Field label="Impressions" htmlFor="impressions">
              <input id="impressions" name="impressions" type="number" className={fieldClass} />
            </Field>
            <Field label="Engagement rate %" htmlFor="engagementRate">
              <input id="engagementRate" name="engagementRate" type="number" step="0.1" className={fieldClass} />
            </Field>
            <Field label="Video views" htmlFor="videoViews">
              <input id="videoViews" name="videoViews" type="number" className={fieldClass} />
            </Field>
            <div className="sm:col-span-3">
              <Button type="submit" variant="primary">
                Add post
              </Button>
            </div>
          </form>
        </CardBody>
        {posts.length > 0 && (
          <CardRows className="border-t border-brand-line">
            {posts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 px-6 py-3.5">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[15px]">{p.title}</span>
                  <span className="text-[13px] text-brand-ink-2">
                    {p.platform}
                    {p.contentType ? ` · ${p.contentType}` : ""}
                  </span>
                </div>
                <StatusPill tone={p.status === "PUBLISHED" ? "success" : "neutral"}>{p.status === "PUBLISHED" ? "Published" : p.status === "PLANNED" ? "Planned" : p.status}</StatusPill>
              </li>
            ))}
          </CardRows>
        )}
      </SectionCard>
    </>
  );
}
