import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SectionCard, CardBody } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { Field, fieldClass } from "@/components/ops/form-field";
import { setAdBudgetAction } from "@/lib/actions/ops-goal-actions";
import { WORK_TZ } from "@/lib/working-hours";

const monthKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: WORK_TZ, year: "numeric", month: "2-digit" }).format(d).slice(0, 7);
const monthName = (m: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`));
const CHANNELS = [
  { key: "all", channel: "", label: "Whole month" },
  { key: "Meta", channel: "Meta", label: "Meta" },
  { key: "Google", channel: "Google", label: "Google Ads" },
  { key: "LinkedIn", channel: "LinkedIn", label: "LinkedIn" },
  { key: "TikTok", channel: "TikTok", label: "TikTok" },
];

/**
 * Client workspace → Planner → Goals & budget (Phase X v2): the client's monthly ad budget, which Insights → Paid
 * ads paces spend against ("90% of plan", projected month end). Set the whole month, a split by channel, or both.
 */
export default async function OpsGoalsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
  if (!client) notFound();
  const now = new Date();
  const months = [0, 1, 2].map((i) => monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 15))));
  const budgets = await prisma.adBudget.findMany({ where: { clientId, month: { in: months } } });
  return (
    <div className="flex flex-col gap-6">
      <SectionCard title="Ad budget">
        <CardBody className="flex flex-col gap-6">
          <p className="m-0 text-[14px] text-brand-ink-2">What {client.name} plans to spend on ads each month. Insights → Paid ads shows spend against it and where the month will end.</p>
          {months.map((m) => {
            const of = (channel: string) => budgets.find((b) => b.month === m && b.channel === channel);
            return (
              <form key={m} action={setAdBudgetAction} className="flex flex-col gap-3 border-b border-brand-line pb-5 last:border-b-0 last:pb-0">
                <input type="hidden" name="clientId" value={clientId} />
                <input type="hidden" name="month" value={m} />
                <h3 className="m-0 text-[16px] font-normal">{monthName(m)}</h3>
                <div className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-6">
                  {CHANNELS.map((c) => (
                    <Field key={c.key} label={c.label} htmlFor={`${m}-${c.key}`}>
                      <input id={`${m}-${c.key}`} name={`amount:${c.key}`} inputMode="decimal" defaultValue={of(c.channel)?.amount ?? ""} placeholder="—" className={fieldClass} />
                    </Field>
                  ))}
                  <Field label="Currency" htmlFor={`${m}-cur`}>
                    <input id={`${m}-cur`} name="currency" defaultValue={budgets.find((b) => b.month === m)?.currency ?? "EUR"} maxLength={3} className={fieldClass} />
                  </Field>
                </div>
                <span>
                  <Button type="submit" size="sm">
                    Save {monthName(m).split(" ")[0]}
                  </Button>
                </span>
              </form>
            );
          })}
        </CardBody>
      </SectionCard>
    </div>
  );
}
