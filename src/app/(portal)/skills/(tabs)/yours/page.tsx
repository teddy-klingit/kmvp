import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getPortalViewer } from "@/lib/current-viewer";
import { BUILD_STEPS, stepIndex } from "@/lib/agent-build";
import { RECOMMENDED_SKILLS, listSkillBuilds, listSkills } from "@/lib/skills";
import { formatDay } from "@/lib/project-state";
import { CardRows, CardNote, SectionCard } from "@/components/ds/card";
import { PageGrid } from "@/components/ds/page-grid";
import { Avatar } from "@/components/ds/avatar";
import { pillClass } from "@/components/ds/button";
import { SkillIcon } from "@/components/portal/skills/skill-icon";
import { CustomSkillRequest } from "@/components/portal/skills/custom-skill-request";
import { setCustomSkillLiveAction } from "@/lib/actions/skill-request-actions";
import { cn } from "@/lib/utils";

const day = (iso: string) => new Date(`${iso}T12:00:00`);

/**
 * Skills → Your skills (nav v3, 03): the custom skills Klingit is building for you (Request → Scoping → Building →
 * Testing → Live, who's on it, and Klingit's open question in orange), and your live or paused custom skills with
 * their AI credits per run and this month's use.
 */
export default async function YourSkillsPage() {
  const viewer = await getPortalViewer();
  const [builds, skills] = await Promise.all([listSkillBuilds(viewer.clientId), listSkills(viewer.clientId)]);
  const requested = new Set(builds.map((b) => b.name.toLowerCase()));
  const custom = skills.filter((s) => s.custom);

  return (
    <PageGrid
      main={
        <>
          <SectionCard title={<>Being built for you <span className="text-[15px] text-brand-mute">{builds.length}</span></>} label="Being built for you">
            {builds.length === 0 ? (
              <CardNote>Nothing being built right now. Request a custom skill and Klingit scopes it with you.</CardNote>
            ) : (
              <CardRows>
                {builds.map((b) => {
                  const current = stepIndex(b.build.step);
                  const test = b.build.dates.Testing;
                  return (
                    <li key={b.projectId} className="flex flex-col gap-4 px-6 py-5">
                      <Link href={`/skills/build/${b.projectId}`} className="flex items-center gap-4 text-brand-ink no-underline">
                        <SkillIcon custom size={36} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-[16px]">{b.name}</span>
                          <span className="truncate text-[14px] text-brand-ink-2">{b.summary}</span>
                        </span>
                        <span className="flex">
                          {b.team.map((name, i) => (
                            <Avatar key={name} name={name} size={26} ring className={i ? "-ml-2" : ""} />
                          ))}
                        </span>
                        <ChevronRight className="size-4 text-brand-ink-2" strokeWidth={1.75} />
                      </Link>
                      <ol aria-label="Build steps" className="m-0 grid list-none grid-cols-5 gap-2 p-0">
                        {BUILD_STEPS.map((s, i) => (
                          <li key={s} className="flex flex-col gap-1.5">
                            <span aria-hidden className={cn("h-1 rounded-full", i < current ? "bg-brand-ink" : i === current ? "bg-brand-orange" : "bg-brand-line")} />
                            <span className={cn("text-[12px]", i <= current ? "text-brand-ink" : "text-brand-mute")}>{s}</span>
                          </li>
                        ))}
                      </ol>
                      <span className="text-[13px] text-brand-mute">
                        {b.build.step}
                        {b.question
                          ? " · Klingit has 1 question for you"
                          : [test && ` · test version ${formatDay(day(test))}`, b.build.buildCredits != null && ` · ${b.build.buildCredits} team credits, once`].filter(Boolean).join("")}
                      </span>
                      {b.question && (
                        <div className="flex flex-wrap items-center gap-3 rounded-[12px] bg-brand-peach-pale px-4 py-3">
                          <span aria-hidden className="size-2 shrink-0 rounded-full bg-brand-orange" />
                          <span className="min-w-0 flex-1 text-[14px]">
                            {b.name}: {b.question}
                          </span>
                          <Link href={`/skills/build/${b.projectId}#conversation`} className={pillClass("primary", "sm")}>
                            Answer
                          </Link>
                        </div>
                      )}
                    </li>
                  );
                })}
              </CardRows>
            )}
          </SectionCard>

          <SectionCard title={<>Your custom skills <span className="text-[15px] text-brand-mute">{custom.length}</span></>} label="Your custom skills" action={<span className="font-brand-mono text-[12px] text-brand-ink">THIS MONTH</span>}>
            {custom.length === 0 ? (
              <CardNote>When a build goes live it shows up here, ready to run.</CardNote>
            ) : (
              <CardRows>
                {custom.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
                    <SkillIcon custom size={36} />
                    <span className="flex min-w-0 flex-1 basis-[160px] flex-col">
                      <span className="text-[16px]">{s.name}</span>
                      <span className="truncate text-[14px] text-brand-ink-2">{s.summary}</span>
                    </span>
                    <span className="inline-flex w-16 items-center gap-1.5 text-[14px]">
                      <span aria-hidden className={cn("size-2 rounded-full", s.live ? "bg-[#8D9E47]" : "bg-brand-mute")} />
                      {s.live ? "Live" : "Paused"}
                    </span>
                    <span className="w-24 text-[14px]">{s.aiPerRun != null ? `≈ ${s.aiPerRun} AI / run` : "—"}</span>
                    <span className="w-32 text-right text-[13px] text-brand-mute">
                      {s.runsThisMonth ? `Run ${s.runsThisMonth}× · ${s.aiThisMonth} AI` : s.lastRunAt ? `Last run ${formatDay(s.lastRunAt)}` : "Not run yet"}
                    </span>
                    <span className="flex w-[84px] justify-end">
                      {s.live ? (
                        <Link href={`/skills/${s.id}`} className={pillClass("primary", "sm")}>
                          Run
                        </Link>
                      ) : (
                        <form action={setCustomSkillLiveAction}>
                          <input type="hidden" name="agentId" value={s.id} />
                          <input type="hidden" name="live" value="true" />
                          <button type="submit" className={pillClass("secondary", "sm")}>
                            Resume
                          </button>
                        </form>
                      )}
                    </span>
                  </li>
                ))}
              </CardRows>
            )}
          </SectionCard>
        </>
      }
      side={
        <>
          <SectionCard title="How custom skills work">
            <ol className="m-0 flex list-none flex-col gap-4 px-6 py-5">
              {[
                <>Describe what you need. Klingit scopes it with you and quotes the build.</>,
                <>
                  The build is paid once in <b className="font-semibold">team credits</b>.
                </>,
                <>
                  Every run after that uses <b className="font-semibold">AI credits</b>, shown before you press Run.
                </>,
              ].map((line, i) => (
                <li key={i} className="flex gap-3 text-[15px] leading-[1.5]">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-chip text-[12px]">{i + 1}</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </SectionCard>
          {/* Klingit recommends: custom skills worth building, until the client has asked for them. */}
          {RECOMMENDED_SKILLS.some((r) => !requested.has(r.name.toLowerCase())) && (
            <SectionCard title="Klingit recommends">
              <CardRows>
                {RECOMMENDED_SKILLS.filter((r) => !requested.has(r.name.toLowerCase())).map((r) => (
                  <li key={r.name} className="flex flex-col gap-2 px-6 py-4">
                    <span className="flex items-start gap-2">
                      <span className="flex-1 text-[15px]">{r.name}</span>
                      <span className="rounded-full bg-brand-lime-pale px-2.5 py-0.5 text-[12px]">{r.reason}</span>
                    </span>
                    <span className="text-[14px] leading-[1.5] text-brand-ink-2">{r.summary}</span>
                    <CustomSkillRequest label="Request build" name={r.name} description={r.summary} size="sm" />
                  </li>
                ))}
              </CardRows>
            </SectionCard>
          )}
          <SectionCard title="Something else?">
            <div className="flex flex-col gap-4 px-6 py-5">
              <p className="m-0 text-[14px] leading-[1.5] text-brand-ink-2">Describe it in a sentence and Klingit builds a skill that already knows your brand.</p>
              <CustomSkillRequest variant="primary" block />
            </div>
          </SectionCard>
        </>
      }
    />
  );
}
