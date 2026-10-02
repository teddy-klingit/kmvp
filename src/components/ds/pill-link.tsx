import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { pillClass } from "@/components/ds/button";
import { cn } from "@/lib/utils";

/** A link that looks like a pill button: black primary or outlined secondary, mono label, optional arrow. */
export function PillLink({
  href,
  children,
  variant = "secondary",
  size = "md",
  arrow = false,
  className,
  external,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
  arrow?: boolean;
  className?: string;
  external?: boolean;
}) {
  return (
    <Link href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className={cn(pillClass(variant, size), "no-underline", className)}>
      {children}
      {arrow && <ArrowRight className="size-3.5" strokeWidth={1.75} />}
    </Link>
  );
}

/** Mono underlined link for card title rows ("ALL PROJECTS"). */
export const monoLink = "font-brand-mono text-[12px] text-brand-ink underline underline-offset-4 hover:no-underline";
