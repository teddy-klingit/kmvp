import { SectionCard } from "@/components/ds/card";
import { PillLink } from "@/components/ds/pill-link";
import { AppIcon } from "@/components/portal/brand-sources/app-icon";
import { appMeta } from "@/lib/brand-sources";

/** Brand OS overview: which apps are connected and how many files are linked. */
export function SourcesSummaryCard({ apps, linkedFiles, demo }: { apps: string[]; linkedFiles: number; demo: boolean }) {
  const named = apps.filter((a) => a !== "web").map((a) => appMeta(a).name);
  return (
    <SectionCard
      title="Sources"
      action={
        <PillLink href="/assets/sources" size="sm">
          Manage sources
        </PillLink>
      }
    >
      <div className="flex flex-wrap items-center gap-4 px-6 py-5">
        <p className="m-0 min-w-0 flex-1 basis-[260px] text-[14px] leading-[1.5] text-brand-ink-2">
          {apps.length === 0 && linkedFiles === 0
            ? "Nothing linked yet. Link where your brand lives so Klingit's agents can reference it."
            : `${linkedFiles} linked file${linkedFiles === 1 ? "" : "s"}${named.length ? ` from ${named.join(", ")}${apps.includes("web") ? " and the web" : ""}` : ""}${demo ? " · demo connections, nothing synced yet" : ""}`}
        </p>
        {apps.length > 0 && (
          <span className="flex items-center gap-1.5" aria-label="Connected apps">
            {apps.map((a) => (
              <AppIcon key={a} app={a} size={16} tile />
            ))}
          </span>
        )}
      </div>
    </SectionCard>
  );
}
