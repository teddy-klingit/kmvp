import Link from "next/link";
import { Check, ChevronLeft, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import type { PortalViewer } from "@/lib/brief-intake";
import { BUILD_STEPS, stepIndex, type AgentBuild } from "@/lib/agent-build";
import { approveAgentTestAction, updateAgentSpecAction } from "@/lib/actions/agent-request-actions";
import { postCommentAction } from "@/lib/actions/project-actions";
import { Avatar } from "@/components/ds/avatar";
import { pillClass } from "@/components/ds/button";
import { cn } from "@/lib/utils";

const date = (iso: string | Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) => new Intl.DateTimeFormat("en-GB", opts).format(typeof iso === "string" ? new Date(`${iso}T12:00:00`) : iso);
const SPEC: { key: keyof AgentBuild["spec"]; label: string }[] = [
  { key: "whatItDoes", label: "What it does" },
  { key: "whatItUses", label: "What it uses" },
  { key: "whatYouGet", label: "What you get" },
  { key: "runs", label: "Runs" },
];

/**
 * An agent build project (AgentProject.dc.html): name and step, the cost summary, the five-step timeline, the
 * spec (editable until building starts), the latest test output with "Looks right" / "Ask for changes", and on
 * the side the conversation with Klingit and the build log. It is a project, so it is on the Projects board too.
 */
export async function AgentBuildView({ projectId, build, share }: { projectId: string; viewer: PortalViewer; build: AgentBuild; share: React.ReactNode }) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      team: { include: { members: { include: { staffMember: { include: { user: true } } } } } },
      comments: { where: { archivedAt: null, assetId: null }, include: { author: true, clientAuthor: { include: { user: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  const requester = project.createdByClientUserId ? await prisma.clientUser.findUnique({ where: { id: project.createdByClientUserId }, include: { user: true } }) : null;
  const builders = (project.team?.members ?? []).map((m) => m.staffMember.user.name);
  const current = stepIndex(build.step);
  const messages = project.comments.filter((c) => c.kind === "MESSAGE");
  const log = project.comments.filter((c) => c.kind === "SYSTEM").reverse();
  const editable = current < stepIndex("Building");

  return (
    <div className="flex min-h-full">
      <div className="min-w-0 flex-1 px-4 pb-24 pt-6 md:px-10 md:pb-12 md:pt-8">
        <div className="mx-auto grid max-w-[1180px] grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-6">
            <Link href="/assets/agents-templates" className="inline-flex items-center gap-1 self-start text-[14px] text-brand-ink-2 no-underline hover:text-brand-ink">
              <ChevronLeft className="size-4" strokeWidth={1.75} /> Agents &amp; templates
            </Link>

            <section aria-label={project.name} className="overflow-hidden rounded-2xl bg-white">
              <div className="flex flex-wrap items-start gap-4 px-6 py-6">
                <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-[12px] bg-brand-lime-pale">
                  <Sparkles className="size-5" strokeWidth={1.5} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-3">
                    <h1 className="m-0 text-[28px] font-normal leading-[1.2]">{project.name}</h1>
                    <span className="rounded-full bg-brand-chip px-2.5 py-1 text-[13px]">{build.step}</span>
                  </span>
                  <span className="text-[15px] text-brand-ink-2">
                    Custom agent{requester ? ` · requested by ${requester.user.name}` : ""} · built by Klingit
                  </span>
                </span>
                {share}
              </div>
              <dl className="m-0 grid grid-cols-2 border-y border-brand-line min-[800px]:grid-cols-4">
                {[
                  ["Build cost", build.buildCredits != null ? `${build.buildCredits} credits, once` : "From the estimate"],
                  ["Each run", build.perRunCredits != null ? `≈ ${build.perRunCredits} credits` : "Not known yet"],
                  ["Test version", build.dates.Testing ? date(build.dates.Testing, { weekday: "short", day: "numeric", month: "short" }) : "Not planned yet"],
                ].map(([k, v], i) => (
                  <div key={k} className={cn("flex flex-col gap-1 px-6 py-4", i > 0 && "border-l border-brand-line", i === 2 && "max-[799px]:border-l-0 max-[799px]:border-t")}>
                    <dt className="text-[13px] text-brand-mute">{k}</dt>
                    <dd className="m-0 text-[17px]">{v}</dd>
                  </div>
                ))}
                <div className="flex items-center gap-3 border-l border-brand-line px-6 py-4 max-[799px]:border-t">
                  <span className="flex">
                    {builders.map((n, i) => (
                      <Avatar key={n} name={n} size={30} ring className={i ? "-ml-2" : ""} />
                    ))}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[13px] text-brand-mute">Built by</span>
                    <span className="text-[17px]">{builders.map((n) => n.split(" ")[0]).join(" · ") || "Klingit"}</span>
                  </span>
                </div>
              </dl>
              <ol aria-label="Build steps" className="m-0 grid list-none grid-cols-5 px-6 py-6">
                {BUILD_STEPS.map((s, i) => {
                  const done = i < current;
                  const now = i === current;
                  const when = build.dates[s];
                  return (
                    <li key={s} className="relative flex flex-col gap-2">
                      <span className="flex items-center">
                        <span
                          aria-hidden
                          className={cn(
                            "z-10 flex size-7 shrink-0 items-center justify-center rounded-full",
                            done && "bg-brand-ink text-white",
                            now && "border-2 border-brand-orange bg-white",
                            !done && !now && "border-2 border-brand-outline bg-white"
                          )}
                        >
                          {done && <Check className="size-3.5" strokeWidth={3} />}
                        </span>
                        {i < BUILD_STEPS.length - 1 && <span aria-hidden className={cn("mx-2 h-0.5 flex-1", done ? "bg-brand-ink" : "bg-brand-line")} />}
                      </span>
                      <span className={cn("text-[15px]", now && "font-semibold")}>{s}</span>
                      <span className={cn("text-[13px]", now ? "text-brand-orange-text" : "text-brand-mute")}>{now ? "Now" : when ? `${done ? "" : "Est. "}${date(when)}` : ""}</span>
                    </li>
                  );
                })}
              </ol>
            </section>

            <section aria-label="Agent spec" className="overflow-hidden rounded-2xl bg-white">
              <header className="flex items-center border-b border-brand-line px-6 py-5">
                <h2 className="m-0 flex-1 text-[20px] font-normal">Agent spec</h2>
                {editable && <span className="text-[13px] text-brand-ink-2">Editable until building starts</span>}
              </header>
              {editable ? (
                <form action={updateAgentSpecAction} className="flex flex-col">
                  <input type="hidden" name="projectId" value={projectId} />
                  {SPEC.map((f) => (
                    <label key={f.key} className="grid grid-cols-1 gap-2 border-b border-brand-line px-6 py-4 min-[700px]:grid-cols-[180px_minmax(0,1fr)]">
                      <span className="text-[15px] font-semibold">{f.label}</span>
                      <textarea name={f.key} defaultValue={build.spec[f.key]} rows={2} className="w-full resize-none rounded-[10px] border border-brand-outline px-3 py-2 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-brand-orange" />
                    </label>
                  ))}
                  <div className="px-6 py-4">
                    <button type="submit" className={pillClass("primary", "sm")}>
                      Save spec
                    </button>
                  </div>
                </form>
              ) : (
                <dl className="m-0">
                  {SPEC.map((f, i) => (
                    <div key={f.key} className={cn("grid grid-cols-1 gap-1 px-6 py-4 min-[700px]:grid-cols-[180px_minmax(0,1fr)] min-[700px]:gap-4", i > 0 && "border-t border-brand-line")}>
                      <dt className="text-[15px] font-semibold">{f.label}</dt>
                      <dd className="m-0 text-[16px] leading-[1.5]">{build.spec[f.key]}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>

            <section aria-label="Test output" className="overflow-hidden rounded-2xl bg-white">
              <header className="flex items-center border-b border-brand-line px-6 py-5">
                <h2 className="m-0 flex-1 text-[20px] font-normal">Test output</h2>
                {build.testOutput?.at && <span className="font-brand-mono text-[12px] text-brand-ink">TEST RUN · {date(new Date(build.testOutput.at)).toUpperCase()}</span>}
              </header>
              {build.testOutput ? (
                <div className="flex flex-col gap-4 px-6 py-5">
                  <span className="text-[15px] text-brand-ink-2">A test run, so you can see what it will produce:</span>
                  <div className="flex flex-col gap-2 rounded-[12px] border border-brand-line bg-[#FBF9F4] px-5 py-4">
                    <span className="flex flex-wrap items-center gap-3">
                      <span className="flex-1 text-[17px]">{build.testOutput.title}</span>
                      {build.testOutput.quality != null && <span className="rounded-full bg-brand-lime-pale px-2.5 py-0.5 text-[13px]">Brief quality {build.testOutput.quality}</span>}
                    </span>
                    <span className="text-[15px] leading-[1.55] text-brand-ink-2">{build.testOutput.text}</span>
                  </div>
                  <div className="flex flex-wrap items-start gap-3">
                    <form action={approveAgentTestAction}>
                      <input type="hidden" name="projectId" value={projectId} />
                      <button type="submit" className={pillClass("primary")}>
                        Looks right
                      </button>
                    </form>
                    <details className="group">
                      <summary className={cn(pillClass("secondary"), "list-none")}>Ask for changes</summary>
                      <form action={postCommentAction} className="mt-3 flex w-[min(520px,85vw)] flex-col gap-2">
                        <input type="hidden" name="projectId" value={projectId} />
                        <textarea name="body" required rows={3} placeholder="What should be different in the output?" className="w-full resize-none rounded-[10px] border border-brand-outline px-3 py-2 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-brand-orange" />
                        <button type="submit" className={cn(pillClass("primary", "sm"), "self-start")}>
                          Send to Klingit
                        </button>
                      </form>
                    </details>
                  </div>
                </div>
              ) : (
                <p className="m-0 px-6 py-5 text-[15px] text-brand-ink-2">The first test run shows up here when it&apos;s ready.</p>
              )}
            </section>
          </div>

          <aside className="flex min-w-0 flex-col gap-6 min-[1100px]:pt-10">
            <section aria-label="Conversation" className="overflow-hidden rounded-2xl bg-white">
              <h2 className="m-0 border-b border-brand-line px-6 py-5 text-[20px] font-normal">Conversation</h2>
              <div className="flex flex-col gap-4 px-6 py-5">
                {messages.length === 0 && <span className="text-[14px] text-brand-ink-2">Questions from Klingit about the build show up here.</span>}
                {messages.map((m) => {
                  const staff = Boolean(m.author);
                  const name = m.clientAuthor?.user.name ?? m.author?.name ?? "Someone";
                  // A short reply to Klingit's question reads as the chosen answer chip.
                  if (!staff && m.body.length <= 24) {
                    return (
                      <span key={m.id} className="ml-10 inline-flex items-center gap-2 self-start rounded-full border-2 border-brand-ink bg-brand-lime-pale px-4 py-1.5 text-[15px]" title={`${name} · ${date(m.createdAt)}`}>
                        {m.body.replace(/\.$/, "")}
                      </span>
                    );
                  }
                  return (
                    <div key={m.id} className="flex gap-3">
                      <Avatar name={name} size={32} />
                      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="text-[13px]">
                          <span className="font-semibold">{name}</span> <span className="text-brand-mute">· {date(m.createdAt)}</span>
                        </span>
                        <span className={cn("rounded-[12px] px-4 py-3 text-[15px] leading-[1.5]", staff ? "bg-brand-chip" : "bg-brand-lime-pale")}>{m.body}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section aria-label="Build log" className="overflow-hidden rounded-2xl bg-white">
              <h2 className="m-0 border-b border-brand-line px-6 py-5 text-[20px] font-normal">Build log</h2>
              <ul className="m-0 list-none p-0">
                {log.map((l) => (
                  <li key={l.id} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-b border-brand-line px-6 py-3.5 last:border-b-0">
                    <span className="text-[14px] text-brand-mute">{date(l.createdAt)}</span>
                    <span className="text-[15px]">{l.body}</span>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
