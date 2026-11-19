import Link from "next/link";
import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOpsPage } from "@/lib/authz";
import { checkIns, getProfile, klingitTeam, KIND_LABEL, listNotes, shortName, type NoteKind } from "@/lib/client-notes";
import { archiveNoteAction, bookCheckInAction, checkInDoneAction, pinNoteAction, saveProfileAction, setFavouriteAction, setReadAction, setSatisfactionAction } from "@/lib/actions/client-note-actions";
import { NoteComposer } from "@/components/ops/client/note-composer";
import { OpsCard } from "@/components/ops/client/client-cards";
import { ProfileRows } from "@/components/ops/client/profile-rows";
import { cn } from "@/lib/utils";

const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);
const weekday = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
const monthYear = (d: Date) => new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(d);
export const KIND_STYLE: Record<NoteKind, { dot: string; pill: string }> = {
  note: { dot: "bg-[#E8B931]", pill: "bg-[#FBF1D2] text-[#7A5A00]" },
  call: { dot: "bg-[#5B6EB8]", pill: "bg-[#E9ECF7] text-[#3E4E8C]" },
  meeting: { dot: "bg-[#B455B6]", pill: "bg-[#F8DCF9] text-[#8E3A90]" },
  decision: { dot: "bg-[#8D9E47]", pill: "bg-[#EEF4DA] text-[#5E6B2A]" },
  risk: { dot: "bg-brand-orange", pill: "bg-[#FFF1E8] text-brand-orange-text" },
};
const FILTERS: [string | null, string][] = [
  [null, "All"],
  ["note", "Notes"],
  ["call", "Calls"],
  ["meeting", "Meetings"],
  ["decision", "Decisions"],
  ["risk", "Risks"],
];
const READ_LABEL = { happy: "Happy", neutral: "Neutral", at_risk: "At risk" } as const;

/**
 * Client page → Notes (Phase T2, design PMClientNotes). Staff only: the composer, the account log with filters, the
 * client profile, the relationship (check-ins, your read, satisfaction) and the Klingit team on the client.
 */
export default async function NotesPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ kind?: string; edit?: string; read?: string; error?: string }> }) {
  await requireOpsPage(["ADMIN", "PM"]);
  const [{ clientId }, q] = await Promise.all([params, searchParams]);
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, createdAt: true } });
  if (!client) notFound();
  const filter = q.kind && q.kind in KIND_LABEL ? q.kind : null;
  const [notes, profile, ci, team, projects] = await Promise.all([
    listNotes(clientId, { kind: filter }),
    getProfile(clientId),
    checkIns(clientId),
    klingitTeam(clientId),
    prisma.project.findMany({ where: { clientId, status: { notIn: ["ARCHIVED", "DRAFT"] } }, select: { id: true, name: true }, orderBy: { updatedAt: "desc" } }),
  ]);
  const base = `/ops/clients/${clientId}/notes`;
  const editing = q.edit === "profile";
  const hidden = <input type="hidden" name="clientId" value={clientId} />;

  return (
    <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-6">
        <NoteComposer clientId={clientId} projects={projects} initialKind={q.kind === "call" ? "call" : "note"} />
        {q.error && <p className="m-0 rounded-lg bg-[#FFF1E8] px-4 py-2 text-[13px] text-brand-orange-text">{q.error}</p>}

        <OpsCard
          title={
            <span className="flex flex-wrap items-center gap-3">
              Account log
              <span className="ml-auto flex flex-wrap gap-1.5">
                {FILTERS.map(([k, label]) => (
                  <Link key={label} href={k ? `${base}?kind=${k}` : base} aria-current={filter === k ? "page" : undefined} className={cn("inline-flex h-8 items-center rounded-full border px-3 text-[13px] no-underline", filter === k ? "border-brand-ink bg-brand-ink text-white" : "border-brand-outline text-brand-ink hover:border-brand-ink")}>
                    {label}
                  </Link>
                ))}
              </span>
            </span>
          }
        >
          {notes.length ? (
            <ol className="m-0 list-none p-0">
              {notes.map((n) => {
                const k = (n.kind in KIND_STYLE ? n.kind : "note") as NoteKind;
                return (
                  <li key={n.id} id={`note-${n.id}`} className="grid scroll-mt-24 grid-cols-[14px_minmax(0,1fr)] gap-x-4 border-t border-brand-line px-6 py-5 first:border-t-0">
                    <span aria-hidden className={cn("mt-1.5 size-2.5 rounded-full", KIND_STYLE[k].dot)} />
                    <div className="flex min-w-0 flex-col gap-2">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className={cn("rounded-md px-2 py-0.5 text-[12px]", KIND_STYLE[k].pill)}>{KIND_LABEL[k]}</span>
                        <span className="text-[16px]">{n.title}</span>
                        {n.pinnedAt && <span className="font-brand-mono text-[11px] uppercase tracking-[0.06em] text-brand-orange-text">Pinned</span>}
                        <span className="ml-auto whitespace-nowrap text-[12px] text-brand-ink-2">
                          {n.author} · {day(n.createdAt)}
                          {n.durationMin ? ` · ${n.durationMin} min` : ""}
                        </span>
                      </div>
                      {n.body && <p className="m-0 whitespace-pre-line text-[14px] leading-[1.55] text-brand-ink-2">{n.body}</p>}
                      <div className="flex flex-wrap items-center gap-2 text-[12px]">
                        {(n.tags as string[]).map((t) => (
                          <span key={t} className="rounded-md bg-brand-chip px-2 py-0.5">
                            {t}
                          </span>
                        ))}
                        {n.kickoff && <span className="rounded-md bg-[#EEF4DA] px-2 py-0.5 text-[#5E6B2A]">Kick-off</span>}
                        {n.project && (
                          <Link href={`/ops/projects/${n.project.id}`} className="text-brand-ink underline underline-offset-4">
                            {n.project.title} ›
                          </Link>
                        )}
                        {n.remindAt && !n.remindDoneAt && <span className="text-brand-ink-2">Reminder {day(n.remindAt)}</span>}
                        <span className="ml-auto flex gap-3">
                          <form action={pinNoteAction}>
                            {hidden}
                            <input type="hidden" name="noteId" value={n.id} />
                            <input type="hidden" name="pin" value={n.pinnedAt ? "0" : "1"} />
                            <button type="submit" className="text-brand-ink-2 underline underline-offset-4 hover:text-brand-ink">
                              {n.pinnedAt ? "Unpin" : "Pin"}
                            </button>
                          </form>
                          <form action={archiveNoteAction}>
                            {hidden}
                            <input type="hidden" name="noteId" value={n.id} />
                            <button type="submit" className="text-brand-ink-2 underline underline-offset-4 hover:text-brand-ink">
                              Archive
                            </button>
                          </form>
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">{filter ? `No ${FILTERS.find(([k]) => k === filter)?.[1].toLowerCase()} yet.` : `Nothing in the log yet. Write what you learn about ${client.name} here: calls, decisions, what they like. Only Klingit staff see it.`}</p>
          )}
        </OpsCard>
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <OpsCard title="Client profile" link={editing ? { label: "Done", href: base } : { label: "Edit", href: `${base}?edit=profile#profile` }} id="profile">
          {editing ? <ProfileForm clientId={clientId} profile={profile} /> : <ProfileRows profile={profile} editHref={`${base}?edit=profile#profile`} />}
        </OpsCard>

        <OpsCard title="Relationship" id="relationship">
          <dl className="m-0 flex flex-col gap-3 px-6 py-5 text-[13px]">
            <Row k="Last check-in" v={ci.last ? `${day(ci.last.at)} · ${ci.last.kind}` : "None yet"} />
            <div className="flex flex-col gap-2">
              <Row k="Next check-in" v={ci.next ? `${weekday(ci.next.at)} · booked` : "Not booked"} />
              {ci.next ? (
                <form action={checkInDoneAction} className="flex justify-end gap-3 text-[12px]">
                  {hidden}
                  <input type="hidden" name="checkInId" value={ci.next.id} />
                  <button type="submit" name="status" value="done" className="text-brand-ink-2 underline underline-offset-4">
                    Mark done
                  </button>
                  <button type="submit" name="status" value="cancelled" className="text-brand-ink-2 underline underline-offset-4">
                    Cancel
                  </button>
                </form>
              ) : (
                <form action={bookCheckInAction} className="flex flex-wrap items-center justify-end gap-2">
                  {hidden}
                  <select name="kind" defaultValue="monthly review" className="h-8 rounded-full border border-brand-outline bg-white px-2 text-[12px]" aria-label="Kind of check-in">
                    <option value="kick-off">Kick-off</option>
                    <option value="monthly review">Monthly review</option>
                    <option value="quarterly review">Quarterly review</option>
                    <option value="check-in">Check-in</option>
                  </select>
                  <input name="at" type="date" required className="h-8 rounded-full border border-brand-outline bg-white px-2 text-[12px]" aria-label="Date" />
                  <button type="submit" className="inline-flex h-8 items-center rounded-full bg-brand-ink px-3 font-brand-mono text-[11px] text-white">
                    Book
                  </button>
                </form>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-brand-ink-2">Your read</dt>
                <dd className="m-0 flex gap-1.5">
                  {(["happy", "neutral", "at_risk"] as const).map((r) =>
                    r === "at_risk" ? (
                      <Link key={r} href={`${base}?read=at_risk#relationship-risk`} className={cn("inline-flex h-8 items-center rounded-full border px-3 text-[13px] no-underline", profile?.read === r ? "border-brand-orange bg-brand-orange text-white" : "border-brand-outline text-brand-ink hover:border-brand-ink")}>
                        {READ_LABEL[r]}
                      </Link>
                    ) : (
                      <form key={r} action={setReadAction}>
                        {hidden}
                        <input type="hidden" name="read" value={r} />
                        <button type="submit" className={cn("inline-flex h-8 items-center rounded-full border px-3 text-[13px]", profile?.read === r ? "border-brand-ink bg-brand-ink text-white" : "border-brand-outline text-brand-ink hover:border-brand-ink")}>
                          {READ_LABEL[r]}
                        </button>
                      </form>
                    )
                  )}
                </dd>
              </div>
              {q.read === "at_risk" && (
                <form action={setReadAction} id="relationship-risk" className="flex flex-col gap-2 rounded-lg bg-[#FFF1E8] p-3">
                  {hidden}
                  <input type="hidden" name="read" value="at_risk" />
                  <label className="text-[12px]" htmlFor="risk-reason">
                    Why is it at risk? It goes in the account log and shows on Clients and in Admin.
                  </label>
                  <textarea id="risk-reason" name="reason" required rows={2} className="rounded-md border border-brand-outline bg-white px-3 py-2 text-[13px]" />
                  <button type="submit" className="self-end rounded-full bg-brand-orange px-4 py-1.5 font-brand-mono text-[11px] text-white">
                    Mark at risk
                  </button>
                </form>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-brand-ink-2">Satisfaction</dt>
              <dd className="m-0 flex items-center gap-2">
                <span>{profile?.satisfaction ? `Last rating ${profile.satisfaction}/10${profile.satisfactionAt ? ` · ${day(profile.satisfactionAt)}` : ""}` : "No rating yet"}</span>
                <form action={setSatisfactionAction} className="flex items-center gap-1">
                  {hidden}
                  <input name="rating" type="number" min={1} max={10} required aria-label="Rating out of 10" className="h-7 w-12 rounded-full border border-brand-outline bg-white px-2 text-[12px]" />
                  <button type="submit" className="text-[12px] underline underline-offset-4">
                    Log
                  </button>
                </form>
              </dd>
            </div>
            <Row k="Client since" v={[monthYear(profile?.clientSince ?? client.createdAt), profile?.cameFrom].filter(Boolean).join(" · ")} />
          </dl>
        </OpsCard>

        <OpsCard title={`Klingit team on ${client.name}`}>
          <ul className="m-0 flex list-none flex-col gap-3 px-6 py-5 text-[14px]">
            {team.pm && (
              <li className="flex items-center gap-3">
                <Initials name={team.pm.name} />
                <span className="flex-1">{shortName(team.pm.name)} · Marketing PM</span>
              </li>
            )}
            {team.creatives.map((c) => (
              <li key={c.userId} className="flex items-center gap-3">
                <Initials name={c.name} />
                <span className="min-w-0 flex-1 truncate">
                  {shortName(c.name)} · {c.role}
                </span>
                <span className="whitespace-nowrap text-[12px] text-brand-ink-2">
                  {c.active ? `${c.projects} project${c.projects === 1 ? "" : "s"}` : "past work"}
                  {c.favourite ? " · favourite" : ""}
                </span>
                <form action={setFavouriteAction}>
                  {hidden}
                  <input type="hidden" name="userId" value={c.userId} />
                  <input type="hidden" name="favourite" value={c.favourite ? "0" : "1"} />
                  <button type="submit" aria-label={c.favourite ? `${c.name} is a favourite: remove` : `Mark ${c.name} as a favourite`} className="flex size-7 items-center justify-center rounded-full hover:bg-black/5">
                    <Star className={cn("size-3.5", c.favourite ? "fill-[#E8B931] text-[#E8B931]" : "text-brand-ink-2")} strokeWidth={1.75} />
                  </button>
                </form>
              </li>
            ))}
            {!team.pm && !team.creatives.length && <li className="text-brand-ink-2">No one yet. The creatives who work on their projects show here.</li>}
          </ul>
        </OpsCard>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-brand-ink-2">{k}</dt>
      <dd className="m-0 text-right">{v}</dd>
    </div>
  );
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  return <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#C8A13A] text-[11px] font-medium text-white">{(parts[0][0] + (parts.at(-1)?.[0] ?? "")).toUpperCase()}</span>;
}

function ProfileForm({ clientId, profile }: { clientId: string; profile: Awaited<ReturnType<typeof getProfile>> }) {
  const field = "w-full rounded-md border border-brand-outline bg-white px-3 py-2 text-[13px]";
  return (
    <form action={saveProfileAction} className="flex flex-col gap-3 px-6 py-5 text-[13px]">
      <input type="hidden" name="clientId" value={clientId} />
      {(
        [
          ["goal", "Goal for the year", profile?.goal],
          ["measures", "What they measure", profile?.measures],
          ["markets", "Markets", profile?.markets],
          ["tools", "Tools", profile?.tools],
          ["cameFrom", "Where they came from", profile?.cameFrom],
          ["tone", "Tone", profile?.preferences.tone],
          ["contact", "How they like to be contacted", profile?.preferences.contact],
          ["decisionDay", "Decision day", profile?.preferences.decisionDay],
        ] as const
      ).map(([name, label, value]) => (
        <label key={name} className="flex flex-col gap-1">
          <span className="text-brand-ink-2">{label}</span>
          <input name={name} defaultValue={value ?? ""} className={field} />
        </label>
      ))}
      <label className="flex flex-col gap-1">
        <span className="text-brand-ink-2">Key dates, one a line: 2026-11-27 Black Friday (they show in the Planner)</span>
        <textarea name="keyDates" rows={3} defaultValue={(profile?.keyDates ?? []).map((k) => `${k.date} ${k.name}`).join("\n")} className={field} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-brand-ink-2">Links, one a line: Brand drive https://…</span>
        <textarea name="links" rows={3} defaultValue={(profile?.links ?? []).map((l) => `${l.label} ${l.url}`).join("\n")} className={field} />
      </label>
      <button type="submit" className="self-end rounded-full bg-brand-ink px-4 py-2 font-brand-mono text-[12px] text-white">
        Save profile
      </button>
    </form>
  );
}
