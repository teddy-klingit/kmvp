import { Loader } from "lucide-react";
import { cn } from "@/lib/utils";

const TINT: Record<string, string> = { Visual: "bg-brand-lime-pale", Briefs: "bg-brand-pink-pale", Copy: "bg-brand-peach-pale", Social: "bg-brand-lavender-pale" };

/** A skill's round spark, tinted by its category (custom skills: pink). */
export function SkillIcon({ category, custom = false, size = 40 }: { category?: string | null; custom?: boolean; size?: number }) {
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-full", custom ? "bg-[#F7E6F7]" : (category && TINT[category]) || "bg-brand-chip")} style={{ width: size, height: size }}>
      <Loader className="size-4 text-brand-ink" strokeWidth={1.5} />
    </span>
  );
}
