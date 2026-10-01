"use client";

import { usePathname } from "next/navigation";
import { PageTransition } from "@/components/shared/page-transition";

const RESERVED = new Set(["new", "inspiration"]);

/** A project page (/projects/[id]/…) owns its full width: it lays out its own column and the docked conversation panel. */
function isProjectDetail(pathname: string) {
  const [, section, id] = pathname.split("/");
  return section === "projects" && Boolean(id) && !RESERVED.has(id);
}

export function PortalMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  if (pathname === "/dashboard") {
    // Brand theme (ClientHome.dc.html): cream page, its own padding and width.
    return (
      <main className="theme-brand min-w-0 flex-1 overflow-y-auto px-4 pb-12 pt-4 min-[900px]:pb-12 min-[900px]:pl-2 min-[900px]:pr-8 min-[900px]:pt-6">
        <PageTransition>{children}</PageTransition>
      </main>
    );
  }
  if (isProjectDetail(pathname)) {
    // No page transition here: it is keyed by pathname and would remount the conversation panel on every tab switch.
    return <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>;
  }
  return (
    <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-6xl">
        <PageTransition>{children}</PageTransition>
      </div>
    </main>
  );
}
