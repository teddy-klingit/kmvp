import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { jsonArray } from "@/lib/utils";
import { Card } from "@/components/insights/tab-parts";

type Persona = { name: string; ageRange: string; description: string; traits: string[] };
type Share = { label: string; pct: number };

/**
 * Brand OS → Audience (Phase X v2): who the audience is — the personas from the brand platform, and the age, gender
 * and locations the social channels report. Moved here from Insights; Insights → Organic social links to it.
 */
export default async function BrandAudiencePage() {
  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;
  const [brandOS, snaps, followers] = await Promise.all([
    prisma.brandOS.findUnique({ where: { clientId }, select: { audiencePersonas: true } }),
    prisma.audienceSnapshot.findMany({ where: { clientId }, orderBy: { capturedAt: "desc" } }),
    prisma.followerSnapshot.findMany({ where: { clientId }, orderBy: { capturedAt: "desc" } }),
  ]);
  const personas = jsonArray<Persona>(brandOS?.audiencePersonas);
  // The newest snapshot per channel.
  const latest = [...new Map(snaps.map((s) => [s.platform, s])).values()];
  const followerCounts = [...new Map(followers.map((f) => [f.platform, f])).values()];

  return (
    <div className="flex flex-col gap-6">
      <Card title="Who it's for">
        {personas.length ? (
          <div className="grid grid-cols-1 gap-4 min-[800px]:grid-cols-3">
            {personas.map((p) => (
              <div key={p.name} className="flex flex-col gap-2 rounded-[12px] bg-[#F8F5EE] px-4 py-4">
                <span className="text-[16px]">{p.name}</span>
                <span className="text-[13px] text-brand-ink-2">{p.ageRange}</span>
                <span className="text-[14px] leading-[1.5]">{p.description}</span>
                {p.traits.length > 0 && <span className="text-[12px] text-brand-ink-2">{p.traits.join(" · ")}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="m-0 text-[14px] text-brand-ink-2">
            No personas yet. Write them in{" "}
            <Link href="/assets/brand-platform/target-audience" className="text-brand-ink underline underline-offset-4">
              Platform → Target audience
            </Link>
            .
          </p>
        )}
      </Card>

      {latest.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 min-[1000px]:grid-cols-3">
          {(
            [
              ["Age", "ageBreakdown"],
              ["Gender", "genderBreakdown"],
              ["Where they live", "topLocations"],
            ] as const
          ).map(([title, key]) => {
            const rows = jsonArray<Share>(latest[0][key]).slice(0, 6);
            return (
              <Card key={key} title={title}>
                {rows.length ? (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {rows.map((r) => (
                      <li key={r.label} className="grid grid-cols-[96px_minmax(0,1fr)_44px] items-center gap-3 text-[14px]">
                        <span>{r.label}</span>
                        <span aria-hidden className="h-2 rounded-full bg-[#B455B6]" style={{ width: `${Math.max(2, r.pct)}%` }} />
                        <span className="text-right tabular-nums">{r.pct}%</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 text-[14px] text-brand-ink-2">Not reported yet.</p>
                )}
                <p className="m-0 mt-3 text-[12px] text-brand-ink-2">From {latest[0].platform}</p>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card title="Age, gender and where they live">
          <p className="m-0 text-[14px] text-brand-ink-2">These come from your Instagram, TikTok and LinkedIn pages once they&apos;re connected in Settings → Connections.</p>
        </Card>
      )}

      {followerCounts.length > 0 && (
        <p className="m-0 text-[14px] text-brand-ink-2">
          Followers: {followerCounts.map((f) => `${f.platform} ${f.followerCount.toLocaleString("en-GB")}`).join(" · ")}. How your channels are growing is in{" "}
          <Link href="/insights/organic" className="text-brand-ink underline underline-offset-4">
            Insights → Organic social
          </Link>
          .
        </p>
      )}
    </div>
  );
}
