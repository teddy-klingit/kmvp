"use client";

import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/ds/page-header";

const SEGMENTS: { label: string; href: string; match: (p: string) => boolean }[] = [
  { label: "Overview", href: "/assets", match: (p) => p === "/assets" },
  { label: "Platform", href: "/assets/brand-platform", match: (p) => p.startsWith("/assets/brand-platform") },
  { label: "Visual identity", href: "/assets/visual-identity", match: (p) => p.startsWith("/assets/visual-identity") },
  { label: "Sources", href: "/assets/sources", match: (p) => p.startsWith("/assets/sources") },
  { label: "Library", href: "/assets/library", match: (p) => ["/assets/library", "/assets/top-performers", "/assets/by-campaign"].some((x) => p.startsWith(x)) },
  { label: "Agents", href: "/assets/agents-templates", match: (p) => p.startsWith("/assets/agents-templates") || p.startsWith("/assets/templates") },
];

/**
 * Brand IQ header (BrandIQ.dc.html): one segmented control instead of the old left sub-menu. A platform
 * section page (BrandSection.dc.html) has its own breadcrumb header, so this one steps aside there.
 */
export function BrandIqHeader() {
  const pathname = usePathname() ?? "/assets";
  if (/^\/assets\/brand-platform\/[^/]+/.test(pathname)) return null;
  return (
    <PageHeader
      eyebrow="Your brand, as Klingit’s agents see it"
      title="Brand IQ"
      tabsLabel="Brand IQ sections"
      tabs={SEGMENTS.map((s) => ({ label: s.label, href: s.href, active: s.match(pathname) }))}
    />
  );
}
