import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const AVATAR_COLORS = [
  "var(--avatar-1)",
  "var(--avatar-2)",
  "var(--avatar-3)",
  "var(--avatar-4)",
  "var(--avatar-5)",
  "var(--avatar-6)",
  "var(--avatar-7)",
  "var(--avatar-8)",
];

export function avatarColorFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatDate(date: Date | string, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" }) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", opts).format(d);
}

/** Ad platforms report spend in the ad account's own currency, not always USD — never hardcode a "$" prefix on these numbers. */
export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

/** Nullable Prisma `Json?` columns default to an empty array/object in the UI. */
export function jsonArray<T = string>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function jsonObject<T extends Record<string, unknown>>(value: unknown): T {
  return (value && typeof value === "object" ? value : {}) as T;
}

/** Pulls the first number out of a loosely-formatted SOW target string
 * ("3% MoM", "4.5% avg per post", "15,000 avg per video") so a KPI's actual
 * value can be judged against it. Returns null when nothing parses. */
export function parseNumericTarget(target: string | null | undefined): number | null {
  if (!target) return null;
  const match = target.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

/** "good" when the actual value meets/beats the parsed target, "bad" when it
 * misses, "neutral" when there's no target to compare against. */
export function kpiToneVsTarget(actual: number | null, target: string | null | undefined): "good" | "bad" | "neutral" {
  const parsed = parseNumericTarget(target);
  if (actual === null || parsed === null) return "neutral";
  return actual >= parsed ? "good" : "bad";
}

export function hexToCmyk(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "—";
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const k = 1 - Math.max(r, g, b);
  if (k === 1) return "0, 0, 0, 100";
  const c = (1 - r - k) / (1 - k);
  const m = (1 - g - k) / (1 - k);
  const y = (1 - b - k) / (1 - k);
  return [c, m, y, k].map((v) => Math.round(v * 100)).join(", ");
}
