import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Download } from "lucide-react";
import { getPortalViewer } from "@/lib/current-viewer";
import { loadAssetDetail } from "@/lib/asset-detail";
import { formatDay } from "@/lib/project-state";
import { SectionCard, CardBody, CardRows } from "@/components/ds/card";
import { PillLink } from "@/components/ds/pill-link";
import { MiniBars } from "@/components/insights/charts";
import { cn, jsonArray } from "@/lib/utils";
import { AddHowItDid } from "@/components/portal/library/output-library";
import { categoryFor, isCategory } from "@/lib/output-categories";
import { clientVisibleVersion } from "@/lib/qc/visibility";

const pct = (n: number) => `${n.toFixed(2).replace(/0$/, "")}%`;

/**
 * One asset from the library (or the Insights leaderboard): the work itself, how it performed next to the
 * client's own average and its format, and how it was made.
 */
export default async function LibraryAssetPage({ params, searchParams }: { params: Promise<{ assetId: string }>; searchParams: Promise<{ from?: string }> }) {
  const { assetId } = await params;
  const from = (await searchParams).from === "insights" ? { href: "/insights", label: "Insights" } : { href: "/library", label: "Output library" };
  const viewer = await getPortalViewer();
  const a = await loadAssetDetail(assetId, viewer.clientId);
  const more = a ? await prisma.agent.findFirst({ where: { key: /carousel|slide/i.test(a.format) ? "carousel_builder" : "ad_gen", availability: "self_service" }, select: { id: true } }) : null;
  if (!a) notFound();
  // Phase U: category, how it was used, who made it, the Brand OS check and every version the client was sent.
  const [row, facts, versions, team] = await Promise.all([
    prisma.asset.findUniqueOrThrow({ where: { id: assetId }, select: { category: true, format: true, type: true, platform: true, name: true, downloadCount: true, project: { select: { type: true } } } }),
    prisma.outputFact.findMany({ where: { assetId }, orderBy: { createdAt: "asc" } }),
    prisma.assetVersion.findMany({ where: { assetId, ...clientVisibleVersion }, orderBy: { number: "desc" }, select: { id: true, number: true, sentAt: true, checks: true } }),
    prisma.team.findUnique({ where: { projectId: a.project.id }, select: { members: { select: { roleOnProject: true, staffMember: { select: { user: { select: { name: true } } } } } } } }),
  ]);
  const category = isCategory(row.category) ? row.category : categoryFor({ format: row.format, type: row.type, channel: row.platform, projectType: row.project.type, title: row.name });
  const latestChecks = jsonArray<{ passed: boolean }>(versions[0]?.checks);
  const p = a.performance;
  const vsAvg = p?.clientAvg ? Math.round(((p.ctr - p.clientAvg) / p.clientAvg) * 100) : null;
  const inReview = a.project.status === "AWAITING_REVIEW";

  return (
    <div className="flex flex-col gap-5">
      <Link href={from.href} className="self-start text-[14px] text-brand-ink-2 no-underline hover:text-brand-ink">
        ‹ {from.label}
      </Link>
      <div className="grid grid-cols-1 gap-6 min-[1000px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* The work */}
        <div className="flex min-h-[360px] items-center justify-center rounded-[12px] bg-[#F2EDE3] p-6">
          {a.type === "VIDEO" && a.file ? (
            <video src={a.file} poster={a.poster ?? undefined} controls playsInline preload="metadata" className="max-h-[70vh] max-w-full rounded-[10px] bg-black shadow-md" style={{ aspectRatio: String(a.ratio) }} />
          ) : a.copy ? (
            <div className="flex w-full max-w-[520px] flex-col gap-3 rounded-[12px] bg-white p-6">
              {a.copy.map((l) => (
                <p key={l.lang} className="m-0 text-[17px] leading-[1.45]">
                  <span className="mr-2 font-brand-mono text-[12px] text-brand-ink-2">{l.lang}</span>
                  {l.text}
                </p>
              ))}
            </div>
          ) : a.file ? (
            // eslint-disable-next-line @next/next/no-img-element -- the access-checked file the client was sent
            <img src={a.file} alt={a.title} className="max-h-[70vh] max-w-full rounded-[10px] object-contain shadow-md" />
          ) : (
            <span className="text-[14px] text-brand-ink-2">No file for this asset.</span>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-[28px] font-normal leading-tight">{a.title}</h1>
            <span className="text-[15px] text-brand-ink-2">
              {[category, a.format, a.size, a.video?.durationSeconds ? `${Math.round(a.video.durationSeconds)} s` : null].filter(Boolean).join(" · ")} ·{" "}
              <Link href={`/projects/${a.project.id}`} className="text-brand-ink-2 underline underline-offset-2">
                {a.project.name}
              </Link>
            </span>
          </div>

          {p ? (
          <SectionCard title="Performance" meta={<span className="text-[13px] text-brand-mute">from your ad accounts</span>}>
            {p ? (
              <CardBody className="flex flex-col gap-5">
                <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[44px] font-semibold leading-none tabular-nums">{pct(p.ctr)}</span>
                    <span className="text-[15px] text-brand-ink-2">click-through rate</span>
                  </span>
                  {vsAvg !== null && (
                    <span className={cn("rounded-full px-3 py-1 text-[13px]", vsAvg >= 0 ? "bg-brand-lime-pale" : "bg-brand-chip")}>
                      {vsAvg >= 0 ? `${vsAvg}% above` : `${Math.abs(vsAvg)}% below`} your average
                    </span>
                  )}
                </div>
                <MiniBars
                  rows={[
                    { label: "This asset", value: p.ctr, display: pct(p.ctr), tone: "ink" },
                    ...(p.clientAvg !== null ? [{ label: "Your average", value: p.clientAvg, display: pct(p.clientAvg), tone: "grey" as const }] : []),
                    ...(p.formatAvg !== null && p.formatCount > 1 ? [{ label: `${p.formatFamily} average`, value: p.formatAvg, display: pct(p.formatAvg), tone: "grey" as const }] : []),
                  ]}
                />
                <span className="text-[14px] text-brand-ink-2">
                  #{p.rank} of {p.of} measured creatives{p.score !== null ? ` · performance score ${p.score}` : ""}
                </span>
                {p.siblings.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[13px] text-brand-mute">Same concept, other sizes</span>
                    <CardRows className="rounded-[10px] border border-brand-line">
                      {p.siblings.map((s) => (
                        <li key={s.id}>
                          <Link href={`/library/${s.id}`} className="flex items-center justify-between px-4 py-2.5 text-[14px] text-brand-ink no-underline hover:bg-[#FBF9F4]">
                            <span>{s.format}</span>
                            <span className="tabular-nums">{pct(s.ctr)}</span>
                          </Link>
                        </li>
                      ))}
                    </CardRows>
                  </div>
                )}
              </CardBody>
            ) : null}
          </SectionCard>
          ) : (
            // No channel data: how it was used (never an empty metric), with "+ Add how it did".
            <SectionCard title="How it was used">
              <CardBody className="flex flex-col gap-3">
                {facts.length === 0 && row.downloadCount === 0 && <p className="m-0 text-[14px] text-brand-ink-2">Nothing yet. Printed it, sent it, used it in a deck? Add it, and it shows here and in Insights.</p>}
                {(facts.length > 0 || row.downloadCount > 0) && (
                  <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                    {facts.map((f) => (
                      <li key={f.id} className="rounded-[6px] bg-brand-page px-2 py-1 text-[13px]">
                        {f.value != null ? `${f.label}: ${f.value.toLocaleString("en-GB")}` : `${f.label} ${f.note ?? ""}`.trim()}
                        {f.value != null && f.note ? ` · ${f.note}` : ""}
                      </li>
                    ))}
                    {row.downloadCount > 0 && <li className="rounded-[6px] bg-brand-page px-2 py-1 text-[13px]">Downloaded {row.downloadCount}×</li>}
                  </ul>
                )}
                <AddHowItDid itemKey={`a_${assetId}`} />
              </CardBody>
            </SectionCard>
          )}


          <SectionCard title="How it was made">
            <CardRows>
              <Row label="Version">
                {a.version}
                {a.sentAt ? ` · sent ${formatDay(a.sentAt)}` : ""}
              </Row>
              {team && team.members.length > 0 && <Row label="Made by">{team.members.map((m) => m.staffMember.user.name).join(", ")}</Row>}
              {latestChecks.length > 0 && <Row label="Brand OS check">{`${latestChecks.filter((c) => c.passed).length} of ${latestChecks.length} passed`}</Row>}
              {versions.length > 1 && <Row label="Versions">{versions.map((v) => `v${v.number}${v.sentAt ? ` ${formatDay(v.sentAt)}` : ""}`).join(" · ")}</Row>}
              <Row label="Rounds of changes">{a.changeRounds}</Row>
              <Row label="Comments">{a.comments}</Row>
              {a.checks > 0 && (
                <Row label="Quality check">
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="size-3.5 text-[#8D9E47]" strokeWidth={3} />
                    Checked by Klingit · {a.checks} checks
                  </span>
                </Row>
              )}
              <Row label="Status">{a.approval ? `Approved${a.approval.by ? ` by ${a.approval.by}` : ""}${a.approval.at ? ` · ${formatDay(a.approval.at)}` : ""}` : inReview ? "Waiting for your review" : a.status === "CHANGES_REQUESTED" ? "Changes asked" : "In review"}</Row>
            </CardRows>
          </SectionCard>

          <div className="flex flex-wrap gap-3">
            {/* Make more like this: the matching skill, started from this asset (or Klingit, from a brief). */}
            {more && (
              <PillLink href={`/skills/${more.id}?likeAsset=${a.id}`} variant="primary">
                Make more like this
              </PillLink>
            )}
            <PillLink href="/brief/new" variant={more ? "secondary" : "primary"}>
              Brief more like this
            </PillLink>
            {inReview && <PillLink href={`/review/${a.project.id}?asset=${a.id}`}>Open in review</PillLink>}
            <PillLink href={`/projects/${a.project.id}`}>Open project</PillLink>
            {a.download && (
              <a href={a.download} className="inline-flex items-center gap-1.5 self-center text-[14px] text-brand-ink underline underline-offset-2">
                <Download className="size-3.5" /> Download
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-4 px-6 py-3.5 text-[15px]">
      <span className="text-brand-ink-2">{label}</span>
      <span className="text-right">{children}</span>
    </li>
  );
}
