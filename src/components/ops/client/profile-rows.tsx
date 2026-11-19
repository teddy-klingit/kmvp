import Link from "next/link";
import type { Profile } from "@/lib/client-notes";

const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${iso}T12:00:00Z`));

/** Phase T2: the client profile as label / value rows (Notes side card, and the onboarding Overview). */
export function ProfileRows({ profile, editHref, year = new Date().getFullYear() }: { profile: Profile | null; editHref: string; year?: number }) {
  const prefs = profile?.preferences ?? {};
  const rows: [string, React.ReactNode][] = [
    [`Goal for ${year}`, profile?.goal],
    ["What they measure", profile?.measures],
    ["Key dates", profile?.keyDates.length ? profile.keyDates.map((k) => `${k.name} ${day(k.date)}`).join(" · ") : null],
    ["Markets", profile?.markets],
    ["Preferences", [prefs.tone, prefs.contact, prefs.decisionDay ? `decisions on ${prefs.decisionDay}` : null].filter(Boolean).join(". ") || null],
    ["Tools", profile?.tools],
    [
      "Links",
      profile?.links.length ? (
        <span className="flex flex-wrap justify-end gap-x-2">
          {profile.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="text-brand-ink underline underline-offset-4">
              {l.label}
            </a>
          ))}
        </span>
      ) : null,
    ],
    ["Came from", profile?.cameFrom],
  ];
  const filled = rows.filter(([, v]) => v);
  if (!filled.length)
    return (
      <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">
        Nothing here yet.{" "}
        <Link href={editHref} className="text-brand-ink underline underline-offset-4">
          Fill in the profile
        </Link>
        : their goal, what they measure, key dates (they feed the Planner), markets, how they like to work, tools and links.
      </p>
    );
  return (
    <dl className="m-0 grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-3 px-6 py-5 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-brand-ink-2">{k}</dt>
          <dd className="m-0">{v ?? <Link href={editHref} className="text-brand-ink-2 underline underline-offset-4">Add</Link>}</dd>
        </div>
      ))}
    </dl>
  );
}
