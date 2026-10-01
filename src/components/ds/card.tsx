import { cn } from "@/lib/utils";

/** White card: 1px #E4E6EA border, radius 12, one subtle shadow. Every section on a redesigned page lives in one. */
export function Card({
  className,
  tone = "default",
  as: Tag = "section",
  ...props
}: React.HTMLAttributes<HTMLElement> & { tone?: "default" | "turn"; as?: "section" | "article" | "div" }) {
  return (
    <Tag
      className={cn(
        "rounded-[12px] border bg-ds-card shadow-ds",
        tone === "turn" ? "border-ds-turn-border" : "border-ds-border",
        className
      )}
      {...props}
    />
  );
}

/** Card title row: 15/600 title, optional meta (pills) next to it, optional action on the right. */
export function CardHeader({
  title,
  meta,
  action,
  className,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3 border-b border-ds-divider px-6 py-[18px]", className)}>
      <h2 className="m-0 text-[15px] font-semibold text-ds-text">{title}</h2>
      {meta}
      {action && <span className="flex-1" />}
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 pb-5 pt-4", className)} {...props} />;
}
