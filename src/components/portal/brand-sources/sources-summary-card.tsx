import Link from "next/link";
import { Card } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { AppIcon } from "@/components/portal/brand-sources/app-icon";
import { appMeta } from "@/lib/brand-sources";

/** Brand OS overview: which apps are connected and how many files are linked. */
export function SourcesSummaryCard({ apps, linkedFiles, demo }: { apps: string[]; linkedFiles: number; demo: boolean }) {
  const named = apps.filter((a) => a !== "web").map((a) => appMeta(a).name);
  return (
    <Card aria-label="Sources" className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[15px] font-semibold text-ds-text">Sources</span>
        <span className="text-[13px] text-ds-text-2">
          {apps.length === 0 && linkedFiles === 0
            ? "Nothing linked yet. Link where your brand lives so Klingit's agents can reference it."
            : `${linkedFiles} linked file${linkedFiles === 1 ? "" : "s"}${named.length ? ` from ${named.join(", ")}${apps.includes("web") ? " and the web" : ""}` : ""}${demo ? " · demo connections, nothing synced yet" : ""}`}
        </span>
      </div>
      {apps.length > 0 && (
        <span className="flex items-center gap-1.5" aria-label="Connected apps">
          {apps.map((a) => (
            <AppIcon key={a} app={a} size={16} tile />
          ))}
        </span>
      )}
      <Button asChild variant="secondary" size="md">
        <Link href="/assets/sources">Manage sources</Link>
      </Button>
    </Card>
  );
}
