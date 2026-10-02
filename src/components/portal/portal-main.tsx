"use client";

import { usePathname } from "next/navigation";
import { PageTransition } from "@/components/shared/page-transition";

const RESERVED = new Set(["new", "inspiration"]);

/** A project page (/projects/[id]/…) owns its full width: it lays out its own column and the docked conversation panel. */
function isProjectDetail(pathname: string) {
  const [, section, id] = pathname.split("/");
  return section === "projects" && Boolean(id) && !RESERVED.has(id);
}

/** Page padding from the designs: 24 top (40 on Insights), 40 right, 56 bottom, 40 left; 16px gutters on phones. */
export function PortalMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  if (isProjectDetail(pathname)) {
    // No page transition here: it is keyed by pathname and would remount the conversation panel on every tab switch.
    return <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>;
  }
  const top = pathname === "/dashboard" ? "min-[900px]:pt-6" : "min-[900px]:pt-10";
  return (
    <main className={`min-w-0 flex-1 overflow-y-auto px-4 pb-12 pt-5 min-[900px]:pb-14 min-[900px]:pl-10 min-[900px]:pr-10 ${top}`}>
      <div className="mx-auto w-full max-w-[1120px]">
        <PageTransition>{children}</PageTransition>
      </div>
    </main>
  );
}
