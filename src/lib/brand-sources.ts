import { BRAND_PLATFORM_DOCS } from "@/lib/brand-iq-taxonomy";

/**
 * Brand OS "Linked sources": where a client's brand material lives. MVP scope: links + demo connections.
 * No OAuth and no syncing; anything that would need a real integration is labelled "demo".
 */
export type SourceApp = "google_drive" | "figma" | "notion" | "dropbox" | "sharepoint" | "canva" | "frameio" | "slack" | "web";

export type AppMeta = {
  key: SourceApp;
  name: string;
  description: string;
  /** simple-icons export name. SharePoint/OneDrive, Canva, Frame.io and Slack aren't in simple-icons (the brands asked to be removed), so they get a lettered tile in their colour. */
  icon?: "siGoogledrive" | "siFigma" | "siNotion" | "siDropbox";
  color: string;
  monogram: string;
  /** Domains that identify links from this app. */
  domains: string[];
};

export const SOURCE_APPS: AppMeta[] = [
  { key: "google_drive", name: "Google Drive", description: "Brand guidelines, decks and photo folders", icon: "siGoogledrive", color: "#4285F4", monogram: "GD", domains: ["drive.google.com", "docs.google.com", "sheets.google.com", "slides.google.com"] },
  { key: "figma", name: "Figma", description: "Design systems, logo files and templates", icon: "siFigma", color: "#F24E1E", monogram: "F", domains: ["figma.com"] },
  { key: "notion", name: "Notion", description: "Brand books, tone of voice and messaging docs", icon: "siNotion", color: "#000000", monogram: "N", domains: ["notion.so", "notion.site"] },
  { key: "dropbox", name: "Dropbox", description: "Photo shoots, video masters and archives", icon: "siDropbox", color: "#0061FF", monogram: "D", domains: ["dropbox.com"] },
  { key: "sharepoint", name: "SharePoint / OneDrive", description: "Company templates and approved brand documents", color: "#0078D4", monogram: "SP", domains: ["sharepoint.com", "onedrive.live.com", "1drv.ms"] },
  { key: "canva", name: "Canva", description: "Brand kit, social templates and presentations", color: "#00C4CC", monogram: "C", domains: ["canva.com"] },
  { key: "frameio", name: "Frame.io", description: "Video reviews, masters and cutdowns", color: "#5B53FF", monogram: "F.io", domains: ["frame.io", "f.io"] },
  { key: "slack", name: "Slack", description: "Brand channels and approval threads", color: "#4A154B", monogram: "S", domains: ["slack.com"] },
  { key: "web", name: "Website / any link", description: "Paste any link: we recognise the app from the address", color: "#5B616B", monogram: "www", domains: [] },
];

export const CONNECTABLE_APPS = SOURCE_APPS.filter((a) => a.key !== "web");

export function appMeta(key: string): AppMeta {
  return SOURCE_APPS.find((a) => a.key === key) ?? SOURCE_APPS[SOURCE_APPS.length - 1];
}

/** "https://www.figma.com/file/…" → figma. Unknown or unparsable → web. */
export function detectApp(url: string): SourceApp {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "web";
  }
  const match = SOURCE_APPS.find((a) => a.domains.some((d) => host === d || host.endsWith(`.${d}`)));
  return match?.key ?? "web";
}

/** Only http(s) links are stored, so a chip can never be a javascript: or data: URL. */
export function normaliseUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** A readable title from a URL when the client didn't give one ("figma.com · Klarna Design System"). */
export function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "")
      .replace(/[-_]+/g, " ")
      .replace(/\?.*$/, "")
      .trim();
    const host = u.hostname.replace(/^www\./, "");
    return last && last.length > 2 && !/^[a-z0-9]{12,}$/i.test(last) ? `${last.charAt(0).toUpperCase()}${last.slice(1)}`.slice(0, 80) : host;
  } catch {
    return url.slice(0, 80);
  }
}

/** What a demo connection "finds" in each app. Picking one creates a demo BrandSource. */
export type DemoFile = { key: string; title: string; kind: "file" | "folder" | "page" | "library"; url: string };

export const DEMO_FILES: Record<Exclude<SourceApp, "web">, DemoFile[]> = {
  google_drive: [
    { key: "gd-guidelines", title: "Brand guidelines 2026.pdf", kind: "file", url: "https://drive.google.com/" },
    { key: "gd-campaign", title: "Campaign assets", kind: "folder", url: "https://drive.google.com/" },
    { key: "gd-photos", title: "Photo library · approved", kind: "folder", url: "https://drive.google.com/" },
    { key: "gd-deck", title: "Sales deck master.pptx", kind: "file", url: "https://drive.google.com/" },
  ],
  figma: [
    { key: "fg-ds", title: "Klarna Design System", kind: "library", url: "https://www.figma.com/" },
    { key: "fg-logo", title: "Logo suite", kind: "file", url: "https://www.figma.com/" },
    { key: "fg-social", title: "Social templates", kind: "file", url: "https://www.figma.com/" },
  ],
  notion: [
    { key: "nt-tone", title: "Tone of voice", kind: "page", url: "https://www.notion.so/" },
    { key: "nt-messaging", title: "Messaging house", kind: "page", url: "https://www.notion.so/" },
    { key: "nt-personas", title: "Customer personas", kind: "page", url: "https://www.notion.so/" },
  ],
  dropbox: [
    { key: "db-shoot", title: "Summer shoot 2026", kind: "folder", url: "https://www.dropbox.com/" },
    { key: "db-video", title: "Video masters", kind: "folder", url: "https://www.dropbox.com/" },
  ],
  sharepoint: [
    { key: "sp-templates", title: "Company templates", kind: "folder", url: "https://www.office.com/" },
    { key: "sp-policy", title: "Brand usage policy.docx", kind: "file", url: "https://www.office.com/" },
  ],
  canva: [
    { key: "cv-kit", title: "Brand kit", kind: "library", url: "https://www.canva.com/" },
    { key: "cv-social", title: "Instagram templates", kind: "file", url: "https://www.canva.com/" },
  ],
  frameio: [
    { key: "fio-reviews", title: "Q3 video reviews", kind: "folder", url: "https://frame.io/" },
    { key: "fio-masters", title: "Approved masters", kind: "folder", url: "https://frame.io/" },
  ],
  slack: [
    { key: "sl-brand", title: "#brand-approvals", kind: "page", url: "https://slack.com/" },
    { key: "sl-mkt", title: "#marketing", kind: "page", url: "https://slack.com/" },
  ],
};

/** Brand OS sections a source can be pinned to. */
export const SOURCE_SECTIONS: { slug: string; label: string }[] = [
  ...BRAND_PLATFORM_DOCS,
  { slug: "visual-identity", label: "Visual identity" },
  { slug: "figma-design-system", label: "Figma design system" },
];

export function sectionLabel(slug: string | null) {
  return SOURCE_SECTIONS.find((s) => s.slug === slug)?.label ?? null;
}
