import type { BrandAssetCategory } from "@/generated/prisma";

export const VISUAL_IDENTITY_FOLDERS = [
  { slug: "logotype", label: "Logotype" },
  { slug: "brand-colours", label: "Brand colours" },
  { slug: "typography", label: "Typography" },
  { slug: "photography", label: "Photography" },
  { slug: "illustration", label: "Illustration" },
  { slug: "icons", label: "Icons" },
  { slug: "patterns", label: "Patterns & textures" },
  { slug: "video", label: "Video" },
  { slug: "animation", label: "Animation" },
];

/** Which BrandAsset category fills a visual identity folder (colours and typography come from BrandOS). */
export const VISUAL_IDENTITY_CATEGORY: Record<string, BrandAssetCategory> = {
  logotype: "LOGO",
  photography: "PHOTOGRAPHY",
  illustration: "ILLUSTRATION",
  icons: "ICON",
  patterns: "PATTERN",
  video: "VIDEO",
  animation: "ANIMATION",
};

export const BRAND_PLATFORM_DOCS = [
  { slug: "our-brand", label: "Our brand" },
  { slug: "vision", label: "Vision" },
  { slug: "mission", label: "Mission" },
  { slug: "core-values", label: "Core values" },
  { slug: "usps", label: "USPs" },
  { slug: "market-position", label: "Market position" },
  { slug: "target-audience", label: "Target audience" },
  { slug: "services-products", label: "Services & products" },
];
