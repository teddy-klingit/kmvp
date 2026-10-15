import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SectionCard, CardNote } from "@/components/ds/card";
import { PillLink } from "@/components/ds/pill-link";
import { clientsWithoutPm } from "@/lib/admin-jobs";
import { unassignedLiveAdAccounts } from "@/lib/integrations/live-ads-owner";

type Job = { kind: string; title: string; detail: string; action: { label: string; href: string } };

/** Admin → To set up (Phase T): the short list of jobs that keep the PMs' Today clean. */
export default async function AdminSetupPage() {
  const [noPm, ads, overdue, oldPlans, requests] = await Promise.all([
    clientsWithoutPm(),
    unassignedLiveAdAccounts(),
    prisma.invoice.findMany({ where: { status: "OVERDUE", client: { isDemo: false } }, include: { client: { select: { name: true } } } }),
    prisma.client.findMany({ where: { isDemo: false, status: { not: "OFFBOARDED" }, contracts: { none: {} } }, select: { name: true, planTier: true } }),
    prisma.purchaseRequest.count({ where: { status: "pending" } }),
  ]);
  const jobs: Job[] = [
    ...noPm.map((c) => ({ kind: "Contact person", title: `${c.name} has no Marketing PM`, detail: "Its tasks are on nobody's Today until someone is assigned.", action: { label: "Assign a PM", href: `/ops/clients/${c.id}/contract` } })),
    ...(ads.length ? [{ kind: "Ad accounts", title: `${ads.length} ad account${ads.length === 1 ? "" : "s"} feed nobody`, detail: ads.map((a) => `${a.platform} ${a.accountId ?? ""}`.trim()).join(" · "), action: { label: "Open settings", href: "/ops/admin/settings" } }] : []),
    ...(overdue.length ? [{ kind: "Billing", title: `${overdue.length} overdue invoice${overdue.length === 1 ? "" : "s"}`, detail: [...new Set(overdue.map((i) => i.client.name))].join(" · "), action: { label: "Open billing", href: "/ops/admin/billing" } }] : []),
    ...(oldPlans.length ? [{ kind: "Migration", title: `${oldPlans.length} client${oldPlans.length === 1 ? " is" : "s are"} still on old plans`, detail: oldPlans.map((c) => c.name).join(" · "), action: { label: "Open migration", href: "/ops/admin/migration" } }] : []),
  ];
  return (
    <div className="flex flex-col gap-6">
      <SectionCard title="To set up" meta={<span className="text-[13px] text-brand-ink-2">Things that keep the PMs&apos; lists clean · {jobs.length}</span>}>
        {jobs.length === 0 ? (
          <CardNote>Nothing to set up.</CardNote>
        ) : (
          <ul className="m-0 list-none p-0">
            {jobs.map((j) => (
              <li key={j.title} className="flex flex-wrap items-center gap-4 border-t border-brand-line px-6 py-4 first:border-t-0">
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-brand-mono text-[11px] uppercase tracking-[0.04em] text-brand-ink-2">{j.kind}</span>
                  <span className="text-[15px]">{j.title}</span>
                  <span className="text-[13px] text-brand-ink-2">{j.detail}</span>
                </span>
                <PillLink href={j.action.href} variant="primary">
                  {j.action.label}
                </PillLink>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <p className="m-0 text-[13px] text-brand-ink-2">
        Only admins see this area. Client requests waiting for a decision: <Link href="/ops/requests">{requests}</Link>.
      </p>
    </div>
  );
}
