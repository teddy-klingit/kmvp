import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { templateSkillKey } from "@/lib/skills";
import { CardNote, SectionCard } from "@/components/ds/card";
import { pillClass } from "@/components/ds/button";
import { cn } from "@/lib/utils";

/**
 * Skills → Templates (nav v3, 04): a template is a starting layout; using one runs its skill with the template
 * (the card says which). Category chips filter; "Use" counts the use and opens the skill.
 */
export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const { cat } = await searchParams;
  const viewer = await getPortalViewer();
  const [templates, skills] = await Promise.all([
    prisma.template.findMany({ where: { OR: [{ clientId: viewer.clientId }, { clientId: null }] }, orderBy: [{ usageCount: "desc" }, { name: "asc" }] }),
    prisma.agent.findMany({ where: { kind: "SKILL", clientId: null }, select: { key: true, name: true } }),
  ]);
  const categories = [...new Set(templates.map((t) => t.category))];
  const shown = cat ? templates.filter((t) => t.category === cat) : templates;
  const skillName = (key: string) => skills.find((s) => s.key === key)?.name ?? "its skill";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {["All", ...categories].map((c) => {
          const on = (c === "All" && !cat) || c === cat;
          return (
            <Link key={c} href={c === "All" ? "/skills/templates" : `/skills/templates?${new URLSearchParams({ cat: c })}`} aria-current={on ? "page" : undefined} className={cn("inline-flex h-9 items-center rounded-full border px-3.5 text-[14px] no-underline", on ? "border-brand-ink bg-brand-ink text-white" : "border-brand-outline bg-white text-brand-ink hover:border-brand-ink")}>
              {c}
            </Link>
          );
        })}
        <span className="ml-auto text-[14px] text-brand-ink-2">A template is a starting layout. Using one runs its skill.</span>
      </div>
      {shown.length === 0 ? (
        <SectionCard>
          <CardNote>No templates yet. Klingit adds them as your design system grows.</CardNote>
        </SectionCard>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-3">
          {shown.map((t) => (
            <li key={t.id} className="flex flex-col overflow-hidden rounded-[14px] bg-white">
              <span className="relative block aspect-[12/5]" style={{ backgroundColor: `color-mix(in srgb, ${t.previewColor} 30%, white)` }}>
                <span className="absolute bottom-3 left-3 rounded-full bg-white px-2 py-0.5 text-[12px]">{t.category}</span>
              </span>
              <div className="flex items-center gap-3 px-4 py-4">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px]">{t.name}</span>
                  <span className="truncate text-[13px] text-brand-mute">
                    Runs with {skillName(templateSkillKey(t))} · {t.usageCount ? `${t.usageCount} use${t.usageCount === 1 ? "" : "s"}` : "New"}
                  </span>
                </span>
                <a href={`/api/templates/${t.id}/use`} className={pillClass("secondary", "sm")}>
                  Use
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
