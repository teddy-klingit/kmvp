import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Pills (brand theme): black primary, outlined secondary, mono label. Ghost for icon/quiet actions. */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-brand-mono transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-text focus-visible:ring-offset-1 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand-ink text-white hover:bg-black",
        secondary: "border border-brand-outline bg-white text-brand-ink hover:border-brand-ink",
        ghost: "bg-transparent font-sans text-brand-ink-2 hover:bg-brand-ink/5 hover:text-brand-ink",
      },
      size: {
        // Phones get 44px targets; the design's 32–40px heights apply from sm up.
        sm: "h-11 px-3.5 text-[12px] sm:h-8",
        md: "h-11 px-4 text-[12px] sm:h-9",
        lg: "h-11 px-5 text-[12px] sm:h-10",
        icon: "size-11 font-sans sm:size-9",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? "button" })}
      {...props}
    />
  );
}

/** Class for a pill-styled link or submit button outside <Button> (e.g. next/link, a server-action form). */
export function pillClass(variant: "primary" | "secondary" = "secondary", size: "sm" | "md" = "md") {
  return cn(buttonVariants({ variant, size: size === "md" ? "lg" : "md" }));
}
