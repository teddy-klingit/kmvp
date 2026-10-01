"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Palette,
  BookOpenText,
  LayoutTemplate,
  FolderOpen,
  HeartPulse,
  Bot,
  Link2,
} from "lucide-react";
import { VISUAL_IDENTITY_FOLDERS, BRAND_PLATFORM_DOCS } from "@/lib/brand-iq-taxonomy";

type NavSection = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: { slug: string; label: string; href: string }[];
};

export function BrandIqSidebar({ templateCategories }: { templateCategories: string[] }) {
  const pathname = usePathname();

  const sections: NavSection[] = [
    { label: "Overview", href: "/assets", icon: LayoutDashboard },
    { label: "Sources", href: "/assets/sources", icon: Link2 },
    {
      label: "Visual identity",
      href: "/assets/visual-identity",
      icon: Palette,
      children: VISUAL_IDENTITY_FOLDERS.map((f) => ({ ...f, href: `/assets/visual-identity/${f.slug}` })),
    },
    {
      label: "Brand & Message platform",
      href: "/assets/brand-platform",
      icon: BookOpenText,
      children: BRAND_PLATFORM_DOCS.map((d) => ({ ...d, href: `/assets/brand-platform/${d.slug}` })),
    },
    {
      label: "Templates",
      href: "/assets/templates",
      icon: LayoutTemplate,
      children: templateCategories.map((c) => ({
        slug: c,
        label: c,
        href: `/assets/templates/${encodeURIComponent(c)}`,
      })),
    },
    {
      label: "Content Library",
      href: "/assets/library",
      icon: FolderOpen,
      children: [
        { slug: "all", label: "All assets", href: "/assets/library" },
        { slug: "top", label: "Top performers", href: "/assets/top-performers" },
        { slug: "project", label: "By project", href: "/assets/by-campaign" },
      ],
    },
    { label: "Brand Health", href: "/assets/brand-health", icon: HeartPulse },
    { label: "Agents & templates", href: "/assets/agents-templates", icon: Bot },
  ];

  return (
    <nav className="flex w-64 shrink-0 flex-col gap-1 border-r border-border pr-4">
      {sections.map((section) => {
        // Overview is /assets itself; every other section also owns its sub-pages.
        const active = pathname === section.href || (section.href !== "/assets" && pathname?.startsWith(section.href + "/"));
        const Icon = section.icon;
        return (
          <div key={section.href} className="flex flex-col">
            <Link
              href={section.href}
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-eggshell text-ink" : "text-ink/80 hover:bg-eggshell/60"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{section.label}</span>
            </Link>
            {active && section.children && section.children.length > 0 && (
              <div className="mb-1 ml-[1.4rem] mt-1 flex flex-col gap-0.5 border-l border-border pl-3">
                {section.children.map((child) => {
                  const childActive = pathname === child.href;
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={cn(
                        "truncate rounded-md px-2 py-1 text-[13px] transition-colors",
                        childActive
                          ? "font-medium text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
