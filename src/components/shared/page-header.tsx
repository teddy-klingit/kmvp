import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { NavTabs, type NavTabItem } from "@/components/ui/nav-tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Title + search/add utility row shared by every page, matching the mockups
 * where "<Title>" and "Search  [+]" always sit on the same header line.
 * Optional breadcrumb above and NavTabs below.
 */
function PageHeader({
  title,
  breadcrumb,
  tabs,
  actions,
  addHref = "/projects/new",
  className,
}: {
  title: React.ReactNode;
  breadcrumb?: { label: string; href: string };
  tabs?: NavTabItem[];
  actions?: React.ReactNode;
  addHref?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {breadcrumb && (
        <Link href={breadcrumb.href} className="text-sm text-primary hover:underline">
          &lt; {breadcrumb.label}
        </Link>
      )}
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-[28px] font-light leading-none tracking-tight text-ink">{title}</h1>
        <div className="flex items-center gap-2">
          {actions ?? (
            <>
              <form action="/search" method="GET" className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input name="q" placeholder="Search" className="h-9 w-48 rounded-full bg-card pl-8" />
              </form>
              <Button size="icon" className="rounded-full" asChild>
                <Link href={addHref}>
                  <Plus className="size-4" />
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
      {tabs && <NavTabs items={tabs} />}
    </div>
  );
}

export { PageHeader };
