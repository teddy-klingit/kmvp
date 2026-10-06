/**
 * Platform specs for the deterministic half of the Brand OS check: the file type a placement takes, its file
 * weight limit, and the size or aspect ratio its format names ("Story 9:16", "Banner 300×250").
 */

export type CheckResult = { key: string; label: string; source: string; passed: boolean; flag?: { label: string; detail: string } };

const MB = 1024 * 1024;

type Spec = { name: string; image: number; video: number; minSide: number };
const SPECS: { match: RegExp; spec: Spec }[] = [
  { match: /display|banner|\d+\s*[×x]\s*\d+/i, spec: { name: "Display specs", image: 150 * 1024, video: 0, minSide: 0 } },
  { match: /linkedin/i, spec: { name: "LinkedIn specs", image: 5 * MB, video: 200 * MB, minSide: 600 } },
  { match: /tiktok/i, spec: { name: "TikTok specs", image: 30 * MB, video: 500 * MB, minSide: 540 } },
  { match: /slide|deck|pdf/i, spec: { name: "Deck specs", image: 25 * MB, video: 250 * MB, minSide: 0 } },
];
const META: Spec = { name: "Meta specs", image: 30 * MB, video: 4096 * MB, minSide: 600 };

export function specFor(format: string, platform: string | null): Spec {
  const text = `${platform ?? ""} ${format}`;
  return SPECS.find((s) => s.match.test(text))?.spec ?? META;
}

/** "Story 9:16" → 0.5625, "1.91:1" → 1.91, "Banner 300×250" → exact 300×250; null when the format names no size. */
export function expectedShape(format: string): { ratio: number; exact?: { width: number; height: number }; label: string } | null {
  const exact = format.match(/(\d{2,4})\s*[×x]\s*(\d{2,4})/);
  if (exact) {
    const width = Number(exact[1]);
    const height = Number(exact[2]);
    return { ratio: width / height, exact: { width, height }, label: `${width}×${height}` };
  }
  const r = format.match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
  if (r) return { ratio: Number(r[1]) / Number(r[2]), label: `${r[1]}:${r[2]}` };
  return null;
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime"];

/** The deterministic checks for one file. Only checks that can actually run are returned (no file → none). */
export function specChecks(a: { format: string; platform: string | null; mimeType: string | null; sizeBytes: number | null; width: number | null; height: number | null }): CheckResult[] {
  if (!a.mimeType) return [];
  const spec = specFor(a.format, a.platform);
  const isVideo = a.mimeType.startsWith("video/");
  const isDeck = spec.name === "Deck specs";
  const typeOk = isDeck ? a.mimeType === "application/pdf" || IMAGE_TYPES.includes(a.mimeType) : isVideo ? VIDEO_TYPES.includes(a.mimeType) && spec.video > 0 : IMAGE_TYPES.includes(a.mimeType);
  const out: CheckResult[] = [
    {
      key: "file_type",
      label: "File type",
      source: spec.name,
      passed: typeOk,
      flag: typeOk ? undefined : { label: "Wrong file type", detail: `${a.mimeType.split("/")[1]?.toUpperCase() ?? a.mimeType} isn't accepted here` },
    },
  ];
  if (a.sizeBytes !== null) {
    const limit = isVideo ? spec.video : spec.image;
    const ok = limit === 0 || a.sizeBytes <= limit;
    const fmt = (n: number) => (n >= MB ? `${Math.round((n / MB) * 10) / 10} MB` : `${Math.round(n / 1024)} KB`);
    out.push({ key: "file_weight", label: "File weight", source: spec.name, passed: ok, flag: ok ? undefined : { label: "File too heavy", detail: `${fmt(a.sizeBytes)}, the limit is ${fmt(limit)}` } });
  }
  const shape = expectedShape(a.format);
  if (shape && a.width && a.height && !isDeck) {
    const ratio = a.width / a.height;
    let problem: { label: string; detail: string } | undefined;
    if (shape.exact) {
      const scale = a.width / shape.exact.width;
      if (!(Number.isInteger(scale) && scale >= 1 && a.height === shape.exact.height * scale)) problem = { label: "Wrong size", detail: `${a.width}×${a.height}, should be ${shape.label}` };
    } else if (Math.abs(ratio - shape.ratio) / shape.ratio > 0.02) {
      problem = { label: "Wrong ratio", detail: `${a.width}×${a.height} isn't ${shape.label}` };
    } else if (spec.minSide && Math.min(a.width, a.height) < spec.minSide) {
      problem = { label: "Too small", detail: `${a.width}×${a.height}, at least ${spec.minSide}px on the short side` };
    }
    out.push({ key: "size", label: "Size and aspect ratio", source: "Size check", passed: !problem, flag: problem });
  }
  return out;
}
