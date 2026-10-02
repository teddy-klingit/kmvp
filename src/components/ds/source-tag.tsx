import { cn } from "@/lib/utils";

export type SourceTone = "brandOS" | "answer" | "suggested" | "pastProject";

const TONE: Record<SourceTone, string> = {
  brandOS: "bg-brand-pink-pale",
  answer: "bg-brand-lime-pale",
  suggested: "bg-brand-peach-pale",
  pastProject: "bg-brand-tag-grey",
};

/**
 * Where a value came from, as a soft pastel pill in sentence case (the "balanced" colour level):
 * From Brand OS = pale pink, Your answer = pale lime, Suggested = pale peach, From <project> = pale grey.
 */
export function SourceTag({ tone, children, className }: { tone: SourceTone; children: React.ReactNode; className?: string }) {
  return <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] text-brand-ink-2", TONE[tone], className)}>{children}</span>;
}
