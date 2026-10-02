import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * What an empty section shows instead of blank space or a placeholder value: a dashed card with one line
 * and one action. `inline` drops the dashed card when it already sits inside a card.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  inline = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  inline?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 px-6 py-8 text-center",
        !inline && "rounded-[12px] border border-dashed border-brand-outline",
        className
      )}
    >
      {Icon && <Icon className="mb-1 size-5 text-brand-ink-2" strokeWidth={1.75} />}
      <p className="m-0 text-[15px] text-brand-ink">{title}</p>
      {description && <p className="m-0 max-w-sm text-[13px] text-brand-ink-2">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
