import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, Check, Loader2, Play, X } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOpsPage } from "@/lib/authz";
import { assetTitle, formatLabel } from "@/lib/asset-display";
import { blockingFlags, loadQcSet, qcGate, type QcVersion } from "@/lib/qc/quality-check";
import { expectedShape } from "@/lib/qc/specs";
import type { StoredCheck } from "@/lib/qc/brand-check";
import { backToDesignerAction, sendFlagToDesignerAction } from "@/lib/actions/qc-actions";
import { pillClass } from "@/components/ds/button";
import { AcceptAsIs, SendToClient } from "@/components/review/qc-forms";
import { QualityChip } from "@/components/review/quality-chip";
import { cn } from "@/lib/utils";

const ROW_H = 108;

type Cell = { v: QcVersion; column: string; ratio: number };

/** Rows = concepts (asset title), columns = sizes (the ratio the format names), as in QCAdSet.dc.html. */
function grid(set: QcVersion[]) {
  const cells: Cell[] = set.map((v) => {
    const shape = expectedShape(v.asset.format);
    return { v, column: shape?.label ?? formatLabel(v.asset.format), ratio: shape?.ratio ?? 1 };
  });
  const columns = [...new Map(cells.map((c) => [c.column, c.ratio])).entries()].sort((a, b) => a[1] - b[1]).map(([c]) => c);
  const rows = [...new Set(cells.map((c) => assetTitle(c.v.asset.name, c.v.asset.format)))].map((title) => ({ title, cells: cells.filter((c) => assetTitle(c.v.asset.name, c.v.asset.format) === title) }));
  return { columns, rows };
}

const checksOf = (v: QcVersion) => (v.checks as StoredCheck[] | null) ?? [];
const fileUrl = (v: QcVersion, number = v.number) => `/api/assets/${v.assetId}/versions/${number}?inline=1`;

/**
 * Quality check (QCAdSet.dc.html): Klingit's step before the client sees anything. The grid of each asset's latest
 * version with flagged cells, the Brand OS check panel with "Send to designer" / "Accept as is" per flag, and
 * "Send to client", which opens only when every flag is fixed or accepted. "View as client" shows the same set
 * the way the client will get it: no flags, no scores, the "Quality checked" chip and comments.
 */
export default async function QualityCheckPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ view?: string }> }) {
  const { projectId } = await params;
  const asClient = (await searchParams).view === "client";
  const viewer = await requireOpsPage(["ADMIN", "PM", "CREATOR"]);
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { client: { select: { name: true } } } });
  if (!project) notFound();
  const set = await loadQcSet(projectId);
  const gate = qcGate(set, viewer.userId);
  const canDecide = viewer.title !== "ART_DIRECTOR" && viewer.title !== "COPYWRITER" && viewer.title !== "MOTION_DESIGNER";
  const { columns, rows } = grid(set);

  const pending = set.filter((v) => v.state === "QC_READY" || v.state === "CHECKING" || v.state === "DRAFT");
  const versionNo = Math.max(0, ...pending.map((v) => v.number));
  const checked = pending.filter((v) => v.state !== "CHECKING");
  const allChecks = checked.flatMap(checksOf);
  const totalChecks = allChecks.length;
  const passed = allChecks.filter((c) => c.passed).length;
  const open = checked.flatMap((v) => v.flags.filter((f) => !f.late && f.status === "OPEN").map((f) => ({ f, v })));
  const withDesigner = set.flatMap((v) => v.flags.filter((f) => !f.late && f.status === "SENT_TO_DESIGNER" && v.state === "DRAFT").map((f) => ({ f, v })));
  const accepted = checked.flatMap((v) => v.flags.filter((f) => !f.late && f.status === "ACCEPTED").map((f) => ({ f, v })));
  const late = set.flatMap((v) => v.flags.filter((f) => f.late && f.status === "OPEN").map((f) => ({ f, v })));
  const passedGroups = [...new Map(allChecks.filter((c) => c.passed && !allChecks.some((x) => x.key === c.key && !x.passed)).map((c) => [c.label, c.source])).entries()];
  const toLook = open.length;
  const back = `/ops/projects/${projectId}`;
  const here = `/ops/projects/${projectId}/qc`;

  const comments = asClient
    ? await prisma.comment.findMany({ where: { projectId, assetId: { not: null }, archivedAt: null, kind: "MESSAGE" }, include: { author: true, clientAuthor: { include: { user: true } }, asset: { select: { name: true, format: true } } }, orderBy: { createdAt: "asc" } })
    : [];
  const clientChecks = new Map<string, { label: string; source: string; count: number }>();
  for (const v of set.filter((v) => v.state !== "CHECKING" && v.state !== "DRAFT")) for (const c of checksOf(v)) clientChecks.set(c.label, { label: c.label, source: c.source, count: (clientChecks.get(c.label)?.count ?? 0) + 1 });
  const clientTotal = [...clientChecks.values()].reduce((a, c) => a + c.count, 0);

  return (
    <div data-fullscreen className="fixed inset-0 z-40 flex flex-col bg-white font-brand text-brand-ink">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-brand-line px-5 py-3.5 min-[900px]:px-8">
        {!asClient && <span className="rounded-[6px] bg-brand-ink px-2 py-1 font-brand-mono text-[11px] text-white">OPS</span>}
        <Link href={back} className="hidden truncate text-[15px] text-brand-ink-2 no-underline hover:text-brand-ink min-[900px]:inline">
          ‹ {project.client.name} · {project.name}
        </Link>
        <span aria-hidden className="hidden h-8 w-px bg-brand-line min-[900px]:block" />
        <span className="flex min-w-[200px] flex-1 flex-col">
          <span className="truncate text-[19px]">{asClient ? project.name : `Quality check · ${project.name}`}</span>
          <span className="text-[13px] text-brand-mute">
            {asClient ? versionNo ? `What the client sees once version ${versionNo} is sent` : "What the client sees now" : versionNo ? `Version ${versionNo} · not sent to the client yet` : "Everything is with the client"}
          </span>
        </span>
        {asClient ? (
          <QualityChip total={clientTotal} items={[...clientChecks.values()]} />
        ) : (
          totalChecks > 0 && (
            <span className={cn("inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px]", toLook ? "bg-brand-peach-pale" : "bg-brand-lime-pale")}>
              {toLook ? <AlertCircle className="size-4 text-brand-orange" strokeWidth={2} /> : <Check className="size-4" strokeWidth={2} />}
              Brand OS check · {passed}/{totalChecks}
              {toLook ? ` · ${toLook} to look at` : ""}
            </span>
          )
        )}
        <nav aria-label="View" className="flex gap-1 rounded-full bg-[var(--seg-track)] p-1">
          <Link href={here} aria-current={!asClient ? "page" : undefined} className={cn("inline-flex h-9 items-center rounded-full px-4 text-[14px] no-underline", !asClient ? "bg-brand-ink text-white" : "text-brand-ink hover:bg-black/5")}>
            Quality check
          </Link>
          <Link href={`${here}?view=client`} aria-current={asClient ? "page" : undefined} className={cn("inline-flex h-9 items-center rounded-full px-4 text-[14px] no-underline", asClient ? "bg-brand-ink text-white" : "text-brand-ink hover:bg-black/5")}>
            View as client
          </Link>
        </nav>
        <Link href={back} aria-label="Close" className="flex size-10 items-center justify-center rounded-full bg-brand-chip text-brand-ink hover:bg-brand-line">
          <X className="size-4" strokeWidth={2} />
        </Link>
      </header>

      <div data-scroll className="flex min-h-0 flex-1 flex-col overflow-y-auto min-[1000px]:flex-row min-[1000px]:overflow-hidden">
        <main data-scroll className="shrink-0 bg-[#F2EDE3] p-5 min-[900px]:p-8 min-[1000px]:min-h-0 min-[1000px]:flex-1 min-[1000px]:shrink min-[1000px]:overflow-auto">
          {set.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-[15px] text-brand-ink-2">Nothing uploaded yet. The team uploads each asset on the project page; the check runs on every new version.</div>
          ) : (
            <>
              <p className="m-0 pb-4 text-right text-[14px] text-brand-ink-2">
                {asClient
                  ? `${rows.length} concept${rows.length === 1 ? "" : "s"} · ${columns.length} size${columns.length === 1 ? "" : "s"} · flags and scores are never shown to the client`
                  : `${checked.length} ad${checked.length === 1 ? "" : "s"} checked · ${checked.filter((v) => blockingFlags(v).length === 0).length} passed${toLook ? " · fix or accept the rest before sending" : ""}`}
              </p>
              <div className="overflow-x-auto rounded-2xl bg-white">
                <table className="w-full min-w-[720px] border-collapse">
                  <thead>
                    <tr className="text-[13px] text-brand-mute">
                      <th className="w-[170px] px-6 py-4 text-left font-normal">Concept</th>
                      {columns.map((c) => (
                        <th key={c} className="px-2 py-4 font-normal">
                          {c}
                        </th>
                      ))}
                      <th className="px-6 py-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const versions = r.cells.map((c) => c.v);
                      const toFix = versions.reduce((a, v) => a + blockingFlags(v).length, 0);
                      const uploader = versions[0]?.uploadedByUserId;
                      return (
                        <tr key={r.title} className="border-t border-brand-line">
                          <td className="px-6 py-5 align-middle">
                            <span className="flex flex-col">
                              <span className="whitespace-nowrap text-[17px]">{r.title}</span>
                              {!asClient && uploader && <Uploader userId={uploader} />}
                            </span>
                          </td>
                          {columns.map((col) => {
                            const cell = r.cells.find((c) => c.column === col);
                            if (!cell) return <td key={col} />;
                            const flags = asClient ? [] : blockingFlags(cell.v);
                            const lateFlags = asClient ? [] : cell.v.flags.filter((f) => f.late && f.status === "OPEN");
                            const h = ROW_H;
                            const w = Math.min(172, Math.round(h * cell.ratio));
                            return (
                              <td key={col} className="px-2 py-5 text-center align-middle">
                                <span className="inline-flex flex-col items-center gap-1.5">
                                  <span
                                    className={cn("relative block overflow-hidden rounded-[8px] bg-brand-chip", (flags.length > 0 || lateFlags.length > 0) && "ring-2 ring-brand-orange ring-offset-2")}
                                    style={{ width: w, height: Math.round(w / cell.ratio), backgroundColor: `color-mix(in srgb, ${cell.v.asset.thumbnailColor} 22%, white)` }}
                                  >
                                    {cell.v.asset.type === "VIDEO" ? (
                                      <Play className="absolute inset-0 m-auto size-6 text-brand-ink/50" />
                                    ) : (
                                      // eslint-disable-next-line @next/next/no-img-element -- access-checked version file
                                      <img src={asClient && cell.v.asset.sentVersion && cell.v.state === "DRAFT" ? fileUrl(cell.v, cell.v.asset.sentVersion) : fileUrl(cell.v)} alt={`${r.title} ${col}`} className="size-full object-cover" loading="lazy" />
                                    )}
                                    {cell.v.state === "CHECKING" && !asClient && (
                                      <span className="absolute inset-0 flex items-center justify-center bg-white/70">
                                        <Loader2 className="size-5 animate-spin text-brand-ink-2" />
                                      </span>
                                    )}
                                  </span>
                                  <span className={cn("max-w-[150px] truncate text-[13px]", flags.length || lateFlags.length ? "text-brand-orange-text" : "text-brand-mute")}>
                                    {flags[0]?.label ?? lateFlags[0]?.label ?? `v${cell.v.number}`}
                                  </span>
                                </span>
                              </td>
                            );
                          })}
                          <td className="whitespace-nowrap px-6 py-5 text-right align-middle text-[15px]">
                            {asClient ? null : versions.some((v) => v.state === "CHECKING") ? (
                              <span className="text-brand-mute">Checking…</span>
                            ) : versions.some((v) => v.state === "DRAFT") ? (
                              <span className="text-brand-mute">With the designer</span>
                            ) : toFix ? (
                              <span className="text-brand-orange-text">{toFix} to fix</span>
                            ) : versions.every((v) => v.state === "QC_READY") && versions.every((v) => checksOf(v).length === 0) ? (
                              <span className="text-brand-mute">No file to check</span>
                            ) : versions.every((v) => v.state === "QC_READY") ? (
                              <span className="inline-flex items-center gap-2">
                                <span aria-hidden className="flex size-6 items-center justify-center rounded-full bg-[#8D9E47]">
                                  <Check className="size-3.5 text-white" strokeWidth={3} />
                                </span>
                                Passed
                              </span>
                            ) : (
                              <span className="text-brand-mute">With the client</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!asClient && (
                <p className="m-0 flex items-center gap-2.5 pt-4 text-[14px] text-brand-ink-2">
                  <span aria-hidden className="size-4 rounded-[4px] border-2 border-brand-orange" />
                  Flagged by the Brand OS check · the client is notified only when everything passes or is accepted
                </p>
              )}
            </>
          )}
        </main>

        <aside data-scroll className="flex w-full shrink-0 flex-col border-t border-brand-line bg-white min-[1000px]:w-[420px] min-[1000px]:border-l min-[1000px]:border-t-0">
          {asClient ? (
            <>
              <h2 className="m-0 border-b border-brand-line px-7 py-5 text-[20px] font-normal">Comments</h2>
              <div className="flex-1 px-7 py-5 min-[1000px]:overflow-y-auto">
                {comments.length === 0 ? (
                  <p className="m-0 text-[14px] text-brand-ink-2">No comments yet. The client comments on each asset; Klingit replies here too.</p>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-5 p-0">
                    {comments.map((c) => (
                      <li key={c.id} className="flex flex-col gap-1">
                        <span className="text-[12px] text-brand-mute">{c.asset ? assetTitle(c.asset.name, c.asset.format) : "Whole set"}</span>
                        <span className="text-[14px]">
                          <span className="font-semibold">{c.clientAuthor?.user.name ?? c.author?.name ?? "Someone"}</span> {c.body}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <>
              <h2 className="m-0 border-b border-brand-line px-7 py-5 text-[20px] font-normal">Brand OS check</h2>
              <div className="flex flex-1 flex-col gap-5 px-7 py-6 min-[1000px]:overflow-y-auto">
                {totalChecks > 0 ? (
                  <div className="flex flex-col gap-3">
                    <span className="flex items-baseline gap-2">
                      <span className="text-[40px] font-semibold leading-none tabular-nums">{passed}</span>
                      <span className="text-[15px] text-brand-ink-2">of {totalChecks} checks passed</span>
                    </span>
                    <span className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${passed} of ${totalChecks} passed`}>
                      <span className="bg-[#8D9E47]" style={{ width: `${(passed / totalChecks) * 100}%` }} />
                      {passed < totalChecks && <span className="flex-1 bg-brand-orange" />}
                    </span>
                    <span className="text-[13px] leading-[1.5] text-brand-mute">Runs on every new version · Brand OS + platform specs · the client never sees this panel</span>
                  </div>
                ) : (
                  <span className="text-[14px] text-brand-ink-2">{set.some((v) => v.state === "CHECKING") ? "The check is running on the new versions." : "No checks ran: nothing new is waiting, or the files have no image the check can read."}</span>
                )}

                {open.length > 0 && (
                  <section className="flex flex-col gap-4">
                    <h3 className="m-0 text-[14px] font-normal text-brand-mute">To look at</h3>
                    {open.map(({ f, v }) => (
                      <div key={f.id} className="flex gap-3">
                        <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-peach-pale text-[13px] font-semibold text-brand-orange">!</span>
                        <span className="flex min-w-0 flex-1 flex-col gap-2">
                          <span className="text-[15px] leading-[1.4]">
                            {assetTitle(v.asset.name, v.asset.format)} {expectedShape(v.asset.format)?.label ?? ""}: {f.detail}
                          </span>
                          <span className="text-[13px] text-brand-mute">{f.source}</span>
                          {canDecide && (
                            <span className="flex flex-wrap items-center gap-3">
                              <form action={sendFlagToDesignerAction}>
                                <input type="hidden" name="flagId" value={f.id} />
                                <button type="submit" className={pillClass("secondary", "sm")}>
                                  Send to designer
                                </button>
                              </form>
                              <AcceptAsIs flagId={f.id} />
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </section>
                )}

                {withDesigner.length > 0 && (
                  <section className="flex flex-col gap-3">
                    <h3 className="m-0 text-[14px] font-normal text-brand-mute">With the designer</h3>
                    {withDesigner.map(({ f, v }) => (
                      <span key={f.id} className="text-[14px] text-brand-ink-2">
                        {assetTitle(v.asset.name, v.asset.format)} v{v.number}: {f.detail} · fixed in the next version
                      </span>
                    ))}
                  </section>
                )}

                {accepted.length > 0 && (
                  <section className="flex flex-col gap-3">
                    <h3 className="m-0 text-[14px] font-normal text-brand-mute">Accepted as is (Klingit only)</h3>
                    {accepted.map(({ f, v }) => (
                      <span key={f.id} className="flex flex-col">
                        <span className="text-[14px]">
                          {assetTitle(v.asset.name, v.asset.format)}: {f.detail}
                        </span>
                        <span className="text-[13px] text-brand-mute">“{f.reason}”</span>
                      </span>
                    ))}
                  </section>
                )}

                {late.length > 0 && (
                  <section className="flex flex-col gap-3 rounded-[12px] bg-brand-peach-pale p-4">
                    <h3 className="m-0 text-[14px] font-normal">Already with the client · now failing</h3>
                    {late.map(({ f, v }) => (
                      <div key={f.id} className="flex flex-col gap-2">
                        <span className="text-[14px]">
                          {assetTitle(v.asset.name, v.asset.format)} v{v.number}: {f.detail}
                        </span>
                        <span className="text-[12px] text-brand-ink-2">{f.source} · the client hasn&apos;t been told</span>
                        {canDecide && (
                          <span className="flex flex-wrap items-center gap-3">
                            <form action={sendFlagToDesignerAction}>
                              <input type="hidden" name="flagId" value={f.id} />
                              <button type="submit" className={pillClass("secondary", "sm")}>
                                Send to designer
                              </button>
                            </form>
                            <AcceptAsIs flagId={f.id} />
                          </span>
                        )}
                      </div>
                    ))}
                  </section>
                )}

                {passedGroups.length > 0 && (
                  <section className="flex flex-col gap-4">
                    <h3 className="m-0 text-[14px] font-normal text-brand-mute">Passed</h3>
                    {passedGroups.map(([label, source]) => (
                      <span key={label} className="flex items-start gap-3">
                        <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#8D9E47]">
                          <Check className="size-3.5 text-white" strokeWidth={3} />
                        </span>
                        <span className="flex flex-col">
                          <span className="text-[15px]">{label}</span>
                          <span className="text-[13px] text-brand-mute">{source}</span>
                        </span>
                      </span>
                    ))}
                  </section>
                )}
              </div>
              <footer className="flex flex-col gap-3 border-t border-brand-line px-7 py-5">
                <span className="text-[13px] leading-[1.5] text-brand-mute">
                  {gate.canSend
                    ? `Everything is checked. The client gets version ${versionNo} with a "Quality checked" badge.`
                    : `${gate.blockers.join(" · ")}. The client gets version ${versionNo || 1} with a "Quality checked" badge.`}
                </span>
                {canDecide ? (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <form action={backToDesignerAction}>
                      <input type="hidden" name="projectId" value={projectId} />
                      <button type="submit" disabled={open.length === 0} className={cn(pillClass("secondary"), "disabled:opacity-50")}>
                        Back to designer
                      </button>
                    </form>
                    <SendToClient projectId={projectId} canSend={gate.canSend} blockers={gate.blockers} />
                  </div>
                ) : (
                  <span className="text-[13px] text-brand-ink-2">A PM sends the work to the client.</span>
                )}
              </footer>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

async function Uploader({ userId }: { userId: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { staffMember: true } });
  if (!user) return null;
  const first = user.name.split(" ");
  return <span className="text-[14px] text-brand-mute">{`${first[0]} ${first[1]?.[0] ? `${first[1][0]}.` : ""}`.trim()} · {user.staffMember ? "designer" : "uploaded"}</span>;
}
