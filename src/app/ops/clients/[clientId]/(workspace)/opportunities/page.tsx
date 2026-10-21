import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SectionCard, CardBody } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { Field, fieldClass } from "@/components/ops/form-field";
import { SOURCES, STATUS_LABEL, evidenceOf, sourcesOf, windowLabel, type Source } from "@/lib/opportunities";
import { addOpportunityAction, editOpportunityAction, hideOpportunityAction, linkInsightAction, reviewOpportunityAction, runScanNowAction, savePmNoteAction, setOpportunityStatusAction } from "@/lib/actions/ops-opportunity-actions";
import { insightSources } from "@/lib/insight-records";


const iso = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "");
const ORIGIN: Record<string, string> = { weekly: "Weekly scan", ask: "Client asked for more", staff: "Added by Klingit", migrated: "From before Phase R", seed: "Demo seed" };

/**
 * Client workspace → Opportunities (Phase R step 4): everything Plan → Opportunities shows the client, plus what's
 * hidden and why things were dismissed. Review, edit, hide, add one, or run a scan now (on Klingit).
 */
export default async function OpsOpportunitiesPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, isDemo: true } });
  if (!client) notFound();
  const [rows, insights] = await Promise.all([
    prisma.opportunity.findMany({ where: { clientId }, orderBy: [{ hiddenAt: "asc" }, { createdAt: "desc" }], include: { routes: { orderBy: { sortOrder: "asc" } }, insights: { include: { insight: true }, orderBy: { sortOrder: "asc" } } }, take: 60 }),
    prisma.insight.findMany({ where: { clientId, status: "active" }, orderBy: { foundAt: "desc" }, take: 60 }),
  ]);
  const insightLabel = (i: (typeof insights)[number]) => `${i.title} · ${i.value} (${insightSources(i).join(", ")})`;
  const reviewers = new Map((await prisma.user.findMany({ where: { id: { in: rows.flatMap((r) => (r.reviewedByUserId ? [r.reviewedByUserId] : [])) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const dismissed = rows.filter((r) => r.status === "dismissed");

  return (
    <>
      <SectionCard
        title="Opportunities"
        meta={<span className="font-brand-mono text-[12px] text-brand-ink-2">{rows.length}</span>}
        action={
          !client.isDemo ? (
            <form action={runScanNowAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <Button type="submit" variant="secondary" size="sm">
                Run a scan now
              </Button>
            </form>
          ) : undefined
        }
      >
        {rows.length === 0 ? (
          <CardBody>
            <p className="m-0 text-[14px] text-brand-ink-2">None yet. The weekly scan runs on Mondays.</p>
          </CardBody>
        ) : (
          <ul className="m-0 list-none p-0">
            {rows.map((o) => (
              <li key={o.id} className={`flex flex-col gap-3 border-b border-brand-line px-6 py-5 last:border-b-0 ${o.hiddenAt ? "opacity-60" : ""}`}>
                <span className="flex flex-wrap items-center gap-2 text-[12px] text-brand-ink-2">
                  {sourcesOf(o).map((s: Source) => (
                    <span key={s} className={`rounded-full px-2 py-0.5 ${SOURCES[s].pill}`}>
                      {SOURCES[s].label}
                    </span>
                  ))}
                  <span>{ORIGIN[o.origin] ?? o.origin}</span>
                  <span>· {STATUS_LABEL[o.status as keyof typeof STATUS_LABEL] ?? o.status}</span>
                  {o.hiddenAt && <span>· hidden</span>}
                  {o.insights.length === 0 && <span className="text-brand-orange-text">· needs an insight, so the client doesn&apos;t see it</span>}
                  {o.reviewedAt ? <span>· Reviewed by {reviewers.get(o.reviewedByUserId ?? "") ?? "Klingit"}</span> : <span className="text-brand-orange-text">· not reviewed</span>}
                </span>
                <details>
                  <summary className="cursor-pointer text-[16px]">{o.title}</summary>
                  <form action={editOpportunityAction} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input type="hidden" name="clientId" value={clientId} />
                    <input type="hidden" name="id" value={o.id} />
                    <Field label="Title" htmlFor={`t-${o.id}`}>
                      <input id={`t-${o.id}`} name="title" defaultValue={o.title} required className={fieldClass} />
                    </Field>
                    <Field label="Why now (card line)" htmlFor={`w-${o.id}`}>
                      <input id={`w-${o.id}`} name="whyNow" defaultValue={o.whyNow ?? ""} className={fieldClass} />
                    </Field>
                    <Field label="Summary" htmlFor={`s-${o.id}`}>
                      <textarea id={`s-${o.id}`} name="summary" defaultValue={o.summary} rows={3} required className={fieldClass} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Window from" htmlFor={`a-${o.id}`}>
                        <input id={`a-${o.id}`} name="windowStart" type="date" defaultValue={iso(o.windowStart)} className={fieldClass} />
                      </Field>
                      <Field label="to" htmlFor={`b-${o.id}`}>
                        <input id={`b-${o.id}`} name="windowEnd" type="date" defaultValue={iso(o.windowEnd)} className={fieldClass} />
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Button type="submit" variant="primary" size="sm">
                        Save and mark reviewed
                      </Button>
                    </div>
                  </form>
                  <form action={savePmNoteAction} className="mt-4 flex flex-col gap-2">
                    <input type="hidden" name="clientId" value={clientId} />
                    <input type="hidden" name="id" value={o.id} />
                    <Field label="From your Marketing PM (the client sees it on the card and the page)" htmlFor={`n-${o.id}`}>
                      <textarea id={`n-${o.id}`} name="pmNote" defaultValue={o.pmNote ?? ""} rows={2} placeholder="e.g. I'd do this one. Concept B is ready, so it's a quick brief." className={fieldClass} />
                    </Field>
                    <Button type="submit" variant="secondary" size="sm" className="self-start">
                      Save note
                    </Button>
                  </form>
                </details>
                <p className="m-0 text-[13px] text-brand-ink-2">
                  {windowLabel(o)} · {o.routes.length} route{o.routes.length === 1 ? "" : "s"}: {o.routes.map((r) => `${r.letter} ${r.name}${r.sampleLine ? ` (“${r.sampleLine}”)` : ""}`).join(" · ")}
                </p>
                {evidenceOf(o).length > 0 && (
                  <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
                    {evidenceOf(o).map((e, i) => (
                      <li key={i}>
                        <b className="font-semibold">{e.value}</b> {e.text} <span className="text-brand-ink-2">({e.source}{e.demo ? ", demo" : ""})</span>
                      </li>
                    ))}
                  </ul>
                )}
                {o.insights.length > 0 && (
                  <p className="m-0 text-[13px]">
                    <span className="text-brand-ink-2">Built from: </span>
                    {o.insights.map((l) => `${l.insight.title} (${l.insight.value})`).join(" · ")}
                  </p>
                )}
                {o.dismissReason && <p className="m-0 text-[13px]">Not for us: {o.dismissReason}</p>}
                <span className="flex flex-wrap gap-2">
                  <form action={reviewOpportunityAction}>
                    <input type="hidden" name="clientId" value={clientId} />
                    <input type="hidden" name="id" value={o.id} />
                    {o.reviewedAt && <input type="hidden" name="undo" value="1" />}
                    <Button type="submit" variant={o.reviewedAt ? "secondary" : "primary"} size="sm">
                      {o.reviewedAt ? "Unmark reviewed" : "Mark reviewed"}
                    </Button>
                  </form>
                  {insights.length > 0 && (
                    <form action={linkInsightAction} className="flex items-center gap-2">
                      <input type="hidden" name="clientId" value={clientId} />
                      <input type="hidden" name="id" value={o.id} />
                      <select name="insightId" aria-label={`Insight to link to ${o.title}`} className={`${fieldClass} h-9 max-w-[320px] py-0 text-[13px]`}>
                        {insights.map((i) => (
                          <option key={i.id} value={i.id}>
                            {insightLabel(i)}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" variant="secondary" size="sm">
                        Link insight
                      </Button>
                    </form>
                  )}
                  <form action={setOpportunityStatusAction} className="flex items-center gap-2">
                    <input type="hidden" name="clientId" value={clientId} />
                    <input type="hidden" name="id" value={o.id} />
                    <select name="status" defaultValue={o.status} aria-label={`Status of ${o.title}`} className={`${fieldClass} h-9 py-0 text-[13px]`}>
                      {Object.entries(STATUS_LABEL).map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" variant="secondary" size="sm">
                      Set status
                    </Button>
                  </form>
                  <form action={hideOpportunityAction}>
                    <input type="hidden" name="clientId" value={clientId} />
                    <input type="hidden" name="id" value={o.id} />
                    {o.hiddenAt && <input type="hidden" name="show" value="1" />}
                    <Button type="submit" variant="secondary" size="sm">
                      {o.hiddenAt ? "Show to client" : "Hide from client"}
                    </Button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {dismissed.length > 0 && (
        <SectionCard title="Why clients said not for us">
          <CardBody>
            <p className="m-0 text-[14px]">
              {Object.entries(dismissed.reduce<Record<string, number>>((m, d) => ({ ...m, [d.dismissReason ?? "No reason"]: (m[d.dismissReason ?? "No reason"] ?? 0) + 1 }), {}))
                .map(([r, n]) => `${r} ${n}`)
                .join(" · ")}
            </p>
            <p className="m-0 mt-2 text-[12px] text-brand-ink-2">The scan reads the latest reasons and steers away from them.</p>
          </CardBody>
        </SectionCard>
      )}

      <SectionCard title="Add one by hand">
        <CardBody>
          <form action={addOpportunityAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input type="hidden" name="clientId" value={clientId} />
            <Field label="Title" htmlFor="title">
              <input id="title" name="title" required className={fieldClass} />
            </Field>
            <Field label="Source" htmlFor="source">
              <select id="source" name="source" className={fieldClass}>
                {(Object.keys(SOURCES) as Source[]).map((s) => (
                  <option key={s} value={s}>
                    {SOURCES[s].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Summary" htmlFor="summary">
              <textarea id="summary" name="summary" rows={3} required className={fieldClass} />
            </Field>
            <Field label="Built from (one or more insights)" htmlFor="insightId">
              <select id="insightId" name="insightId" multiple required size={Math.min(6, Math.max(2, insights.length))} className={fieldClass}>
                {insights.map((i) => (
                  <option key={i.id} value={i.id}>
                    {insightLabel(i)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="First route" htmlFor="route">
              <input id="route" name="route" placeholder="e.g. The gift set edit" className={fieldClass} />
            </Field>
            <Field label="Window from" htmlFor="windowStart">
              <input id="windowStart" name="windowStart" type="date" className={fieldClass} />
            </Field>
            <Field label="to" htmlFor="windowEnd">
              <input id="windowEnd" name="windowEnd" type="date" className={fieldClass} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" variant="primary">
                Add opportunity
              </Button>
            </div>
          </form>
        </CardBody>
      </SectionCard>
    </>
  );
}

