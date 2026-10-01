import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** What an empty box shows instead of blank space or a placeholder value. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-6 py-8 text-center", className)}>
      {Icon && (
        <span className="mb-1 flex size-10 items-center justify-center rounded-[10px] bg-ds-subtle text-ds-text-2">
          <Icon className="size-5" />
        </span>
      )}
      <p className="text-[14px] font-semibold text-ds-text">{title}</p>
      {description && <p className="max-w-sm text-[13px] text-ds-text-2">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
