import { cn } from "@/lib/utils";

/** Brand form controls for the ops admin forms (new client, new project, content plan, custom apps, Brand OS). */
export const fieldClass =
  "h-11 w-full min-w-0 rounded-[8px] border border-brand-outline bg-white px-3 text-[14px] text-brand-ink outline-none placeholder:text-brand-ink-2/70 focus:border-brand-ink sm:h-10";

export const textareaClass =
  "w-full min-w-0 rounded-[8px] border border-brand-outline bg-white px-3 py-2.5 text-[14px] leading-[1.5] text-brand-ink outline-none placeholder:text-brand-ink-2/70 focus:border-brand-ink";

/** Label above a control, with an optional hint line under it. */
export function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-[13px] text-brand-ink-2">
          {label}
        </label>
      ) : (
        <span className="text-[13px] text-brand-ink-2">{label}</span>
      )}
      {children}
      {hint && <span className="text-[12px] text-brand-ink-2">{hint}</span>}
    </div>
  );
}
