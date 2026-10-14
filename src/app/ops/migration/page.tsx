import Link from "next/link";
import { requireOpsPage } from "@/lib/authz";
import { migrationPreview, type MigrationRow, type Proposal } from "@/lib/migration";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { SectionCard, CardNote } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { formatMoney } from "@/lib/pricing";

const day = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d) : "Not recorded");
const WAY: Record<number, string> = { 1: "1 · Platform only", 2: "2 · + Marketing PM", 3: "3 · + PM + creative team" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[12px] text-brand-ink-2">{label}</dt>
      <dd className="m-0 text-[14px]">{children}</dd>
    </div>
  );
}

function priceOf(p: Proposal, currency: MigrationRow["proposed"]["currency"]) {
  if (p.total != null) return `${formatMoney(p.total, currency)} a month (platform ${formatMoney(p.platform, currency)} + team ${formatMoney(p.team ?? 0, currency)})`;
  return `${formatMoney(p.platform, currency)} a month for the platform; team work priced per request`;
}

/**
 * Ops → Migration (Phase S, S8): the per-client preview. Read-only: there is no apply button here. Each client is
 * moved one at a time, logged, after a decision on its row (overrides included).
 */
export default async function MigrationPage() {
  await requireOpsPage(["ADMIN", "PM"]);
  const { rows, migrated } = await migrationPreview();
  return (
    <OpsPage>
      <PageHeader eyebrow={`${rows.length} client${rows.length === 1 ? "" : "s"} to decide · ${migrated.length} on a contract`} title="Migration preview" />
      <CardNote className="px-0 py-0">
        Nothing here is applied. Each client moves to a contract only after a decision on its row, one at a time, with an in-app notice and an email draft. Clients not migrated keep today&apos;s setup. Prices are placeholders from the Price List.
      </CardNote>
      {rows.length === 0 && (
        <SectionCard title="Nothing to migrate">
          <CardNote>Every client is on a contract.</CardNote>
        </SectionCard>
      )}
      {rows.map((r) => (
        <SectionCard key={r.clientId} title={r.name} action={<StatusPill tone="watch">Waiting for your decision</StatusPill>}>
          <div className="grid grid-cols-1 gap-6 px-6 py-5 min-[1000px]:grid-cols-2">
            <section aria-label="Today" className="flex flex-col gap-3">
              <h3 className="m-0 font-brand-mono text-[12px] uppercase tracking-[0.04em] text-brand-ink-2">Today</h3>
              <dl className="m-0 grid grid-cols-2 gap-3">
                <Field label="Plan">{r.current.plan} (old)</Field>
                <Field label="Team credits a month">
                  {r.current.teamCredits}
                  {r.current.override != null && <span className="text-brand-ink-2"> · override (plan: {r.current.planTeamCredits})</span>}
                </Field>
                <Field label="AI credits a month">{r.current.aiCredits.toLocaleString("en-GB")}</Field>
                <Field label="Projects at once">{r.current.slots}</Field>
                <Field label="Term · renews">Not recorded · {day(r.current.renewal)}</Field>
                <Field label="Price">{r.current.price != null ? `${r.current.price} ${r.current.currency}` : `Not set (${r.current.currency})`}</Field>
                <Field label="Active projects">{r.current.activeProjects}</Field>
                <Field label="Old credit balance">{r.current.balance}</Field>
              </dl>
            </section>
            <section aria-label="Proposed" className="flex flex-col gap-3">
              <h3 className="m-0 font-brand-mono text-[12px] uppercase tracking-[0.04em] text-brand-ink-2">Proposed</h3>
              <dl className="m-0 grid grid-cols-2 gap-3">
                <Field label="Way">{WAY[r.proposed.way]}</Field>
                <Field label="Platform plan">
                  {r.proposed.planName} · {r.proposed.aiCredits.toLocaleString("en-GB")} AI credits
                </Field>
                <Field label="Team pack">{r.proposed.packName ?? "None"}</Field>
                <Field label="Contact person">{r.proposed.contact?.name ?? <span className="text-brand-orange-text">Not set: pick one</span>}</Field>
                <Field label="Start">{day(r.proposed.start)}</Field>
                <Field label="Term · invoicing">
                  {r.proposed.termMonths} months · {r.proposed.invoicing} · {r.proposed.currency}
                </Field>
              </dl>
              <Field label="New total">{priceOf(r.proposed, r.proposed.currency)}</Field>
              {r.withoutOverride && (
                <Field label={`Without the override (the plan's ${r.current.planTeamCredits} credits)`}>
                  {r.withoutOverride.packName ?? "Platform only"} · {priceOf(r.withoutOverride, r.proposed.currency)}
                </Field>
              )}
            </section>
          </div>
          <ul className="m-0 flex list-none flex-col gap-1.5 border-t border-brand-line px-6 py-4">
            {r.flags.map((f) => (
              <li key={f} className="text-[13px] text-brand-ink-2">
                {f}
              </li>
            ))}
          </ul>
        </SectionCard>
      ))}
      {migrated.length > 0 && (
        <SectionCard title="On a contract">
          <CardNote>
            {migrated.map((m, i) => (
              <span key={m.id}>
                {i > 0 && " · "}
                <Link href={`/ops/clients/${m.id}/contract`}>{m.name}</Link>
              </span>
            ))}
          </CardNote>
        </SectionCard>
      )}
    </OpsPage>
  );
}
