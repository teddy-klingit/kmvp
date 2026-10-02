import { cn } from "@/lib/utils";

/**
 * White card, radius 12, no border, no shadow: the cream page does the separating (brand theme).
 * Every section on a page lives in one. `tone="turn"` adds a peach ring for "your action" cards.
 */
export function Card({
  className,
  tone = "default",
  as: Tag = "section",
  ...props
}: React.HTMLAttributes<HTMLElement> & { tone?: "default" | "turn" | "muted"; as?: "section" | "article" | "div" | "li" }) {
  return (
    <Tag
      className={cn(
        "min-w-0 scroll-mt-6 rounded-[12px]",
        tone === "muted" ? "bg-brand-chip" : "bg-white",
        tone === "turn" && "ring-1 ring-inset ring-ds-turn-border",
        className
      )}
      {...props}
    />
  );
}

/** The one title row: 18px weight 400, 20px 24px padding, a #EFEBE2 rule, optional meta next to the title and an action on the right. */
export function CardHeader({
  title,
  meta,
  action,
  className,
  as: H = "h2",
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  as?: "h2" | "h3";
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-brand-line px-6 py-5", className)}>
      <H className="m-0 min-w-0 text-[18px] font-normal leading-[1.45] text-brand-ink">{title}</H>
      {meta}
      <span className="flex-1" />
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 pb-6 pt-5", className)} {...props} />;
}

/** Card + title row in one, for the common case. */
export function SectionCard({
  title,
  action,
  meta,
  label,
  id,
  className,
  tone,
  children,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  meta?: React.ReactNode;
  /** aria-label; defaults to the title when it's a string. */
  label?: string;
  id?: string;
  className?: string;
  tone?: "default" | "turn" | "muted";
  children: React.ReactNode;
}) {
  return (
    <Card id={id} tone={tone} aria-label={label ?? (typeof title === "string" ? title : undefined)} className={cn("overflow-hidden", className)}>
      {title !== undefined && <CardHeader title={title} meta={meta} action={action} />}
      {children}
    </Card>
  );
}

/** Rows separated by the divider colour, inside a card. */
export function CardRows({ className, as: Tag = "ul", ...props }: React.HTMLAttributes<HTMLElement> & { as?: "ul" | "ol" | "div" }) {
  return <Tag className={cn("m-0 list-none p-0 [&>*+*]:border-t [&>*+*]:border-brand-line", className)} {...props} />;
}

/** A quiet line inside a card when a section has nothing to show yet. */
export function CardNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("m-0 px-6 py-5 text-[14px] text-brand-ink-2", className)}>{children}</p>;
}
