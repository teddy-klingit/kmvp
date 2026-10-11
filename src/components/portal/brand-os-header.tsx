"use client";

import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/ds/page-header";

const SEGMENTS: { label: string; href: string; match: (p: string) => boolean }[] = [
  { label: "Overview", href: "/assets", match: (p) => p === "/assets" },
  { label: "Platform", href: "/assets/brand-platform", match: (p) => p.startsWith("/assets/brand-platform") },
  { label: "Visual identity", href: "/assets/visual-identity", match: (p) => p.startsWith("/assets/visual-identity") },
  { label: "Rules", href: "/assets/rules", match: (p) => p.startsWith("/assets/rules") },
];

/**
 * Brand OS header (nav v3): Overview · Platform · Visual identity · Rules. Library moved to the Output library,
 * Sources to Settings → Connections, Agents & templates to Skills. A platform
 * section page (BrandSection.dc.html) has its own breadcrumb header, so this one steps aside there.
 */
export function BrandOsHeader() {
  const pathname = usePathname() ?? "/assets";
  if (/^\/assets\/brand-platform\/[^/]+/.test(pathname)) return null;
  return (
    <PageHeader
      eyebrow="Your brand, as Klingit and your skills see it"
      title="Brand OS"
      tabsLabel="Brand OS sections"
      tabs={SEGMENTS.map((s) => ({ label: s.label, href: s.href, active: s.match(pathname) }))}
    />
  );
}
