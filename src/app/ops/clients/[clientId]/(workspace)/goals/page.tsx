import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SectionCard, CardBody } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { Field, fieldClass } from "@/components/ops/form-field";
import { deleteGoalAction, saveGoalAction, setAdBudgetAction } from "@/lib/actions/ops-goal-actions";
import { goalViews } from "@/lib/insights/goals";
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
  const [budgets, goals, views] = await Promise.all([prisma.adBudget.findMany({ where: { clientId, month: { in: months } } }), prisma.clientGoal.findMany({ where: { clientId }, orderBy: { sortOrder: "asc" } }), goalViews(clientId)]);
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  return (
    <div className="flex flex-col gap-6">
      <SectionCard title="Goals">
        <CardBody className="flex flex-col gap-6">
          <p className="m-0 text-[14px] text-brand-ink-2">{client.name}&apos;s marketing goals, shown on Insights → Overview with progress and On track / Behind. “Online sales vs last year” is measured from the shop; anything else, enter where it stands.</p>
          {[...goals, null].map((g) => {
            const v = g ? views.find((x) => x.id === g.id) : null;
            return (
              <form key={g?.id ?? "new"} action={saveGoalAction} className="flex flex-col gap-3 border-b border-brand-line pb-5 last:border-b-0 last:pb-0">
                <input type="hidden" name="clientId" value={clientId} />
                {g && <input type="hidden" name="id" value={g.id} />}
                <h3 className="m-0 text-[16px] font-fw-medium">
                  {g ? g.title : "Add a goal"}
                  {v?.status ? <span className="ml-2 text-[13px] text-brand-ink-2">· {v.status}{v.line ? ` · ${v.line}` : ""}</span> : null}
                </h3>
                <div className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-4">
                  <Field label="Goal" htmlFor={`t-${g?.id ?? "new"}`} className="col-span-2">
                    <input id={`t-${g?.id ?? "new"}`} name="title" required defaultValue={g?.title ?? ""} placeholder="+40% online sales vs 2025" className={fieldClass} />
                  </Field>
                  <Field label="Measured" htmlFor={`m-${g?.id ?? "new"}`}>
                    <select id={`m-${g?.id ?? "new"}`} name="measure" defaultValue={g?.measure ?? "manual"} className={fieldClass}>
                      <option value="manual">By hand</option>
                      <option value="online_sales_yoy">Online sales vs last year (%)</option>
                    </select>
                  </Field>
                  <Field label="Target" htmlFor={`g-${g?.id ?? "new"}`}>
                    <input id={`g-${g?.id ?? "new"}`} name="target" required inputMode="decimal" defaultValue={g?.target ?? ""} placeholder="40" className={fieldClass} />
                  </Field>
                  <Field label="Where it stands (by hand)" htmlFor={`c-${g?.id ?? "new"}`}>
                    <input id={`c-${g?.id ?? "new"}`} name="current" inputMode="decimal" defaultValue={g?.current ?? ""} placeholder="6100" className={fieldClass} />
                  </Field>
                  <Field label="Unit" htmlFor={`u-${g?.id ?? "new"}`}>
                    <input id={`u-${g?.id ?? "new"}`} name="unit" defaultValue={g?.unit ?? ""} placeholder="members" className={fieldClass} />
                  </Field>
                  <Field label="From" htmlFor={`s-${g?.id ?? "new"}`}>
                    <input id={`s-${g?.id ?? "new"}`} name="startAt" type="date" defaultValue={iso(g?.startAt ?? null)} className={fieldClass} />
                  </Field>
                  <Field label="By" htmlFor={`d-${g?.id ?? "new"}`}>
                    <input id={`d-${g?.id ?? "new"}`} name="dueAt" type="date" defaultValue={iso(g?.dueAt ?? null)} className={fieldClass} />
                  </Field>
                  <Field label="Note under the bar" htmlFor={`n-${g?.id ?? "new"}`} className="col-span-2 min-[900px]:col-span-4">
                    <input id={`n-${g?.id ?? "new"}`} name="note" defaultValue={g?.note ?? ""} placeholder="sign-ups slowed since August" className={fieldClass} />
                  </Field>
                </div>
                <span className="flex gap-2">
                  <Button type="submit" size="sm" variant="primary">
                    {g ? "Save" : "Add goal"}
                  </Button>
                  {g && (
                    <Button type="submit" size="sm" variant="ghost" formAction={deleteGoalAction}>
                      Remove
                    </Button>
                  )}
                </span>
              </form>
            );
          })}
        </CardBody>
      </SectionCard>
      <SectionCard title="Ad budget">
        <CardBody className="flex flex-col gap-6">
          <p className="m-0 text-[14px] text-brand-ink-2">What {client.name} plans to spend on ads each month. Insights → Paid ads shows spend against it and where the month will end.</p>
          {months.map((m) => {
            const of = (channel: string) => budgets.find((b) => b.month === m && b.channel === channel);
            return (
              <form key={m} action={setAdBudgetAction} className="flex flex-col gap-3 border-b border-brand-line pb-5 last:border-b-0 last:pb-0">
                <input type="hidden" name="clientId" value={clientId} />
                <input type="hidden" name="month" value={m} />
                <h3 className="m-0 text-[16px] font-fw-medium">{monthName(m)}</h3>
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
                  <Button type="submit" size="sm" variant="primary">
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
