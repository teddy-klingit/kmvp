import { cn } from "@/lib/utils";

/**
 * A numbered list row: marker, title + one-line detail, optional meta (a due date) and one action.
 * `marker="you"` is the orange circle (your action, e.g. "Do this next"); `marker="agent"` is the lime
 * square for agent-written takeaways. On narrow cards the meta and action move under the text.
 */
export function NumberedRow({
  n,
  marker = "agent",
  title,
  detail,
  meta,
  action,
  as: Tag = "li",
}: {
  n: number;
  marker?: "you" | "agent";
  title: React.ReactNode;
  detail?: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  as?: "li" | "div";
}) {
  return (
    <Tag className="@container/row flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-5">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center font-brand-mono text-[13px] text-brand-ink",
          marker === "you" ? "rounded-full bg-brand-orange" : "rounded-[8px] bg-brand-lime"
        )}
      >
        {n}
      </span>
      <div className="flex min-w-0 flex-1 basis-[calc(100%-48px)] flex-col gap-0.5 @min-[560px]/row:basis-0">
        <span className="text-[17px] leading-[1.45]">{title}</span>
        {detail && <span className="text-[14px] leading-[1.5] text-brand-ink-2">{detail}</span>}
      </div>
      {meta && <span className="flex-1 whitespace-nowrap text-[13px] @min-[560px]/row:w-[110px] @min-[560px]/row:flex-none @min-[560px]/row:text-right">{meta}</span>}
      {action && <span className={cn("shrink-0", !meta && "ml-12 @min-[560px]/row:ml-0")}>{action}</span>}
    </Tag>
  );
}
