import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Everything clickable is a pill with a mono label (brand theme): black primary, outlined secondary. */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-brand-mono text-[12px] transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
  {
    variants: {
      variant: {
        primary: "bg-brand-ink text-white hover:bg-black",
        secondary: "border border-brand-outline bg-white text-brand-ink hover:border-brand-ink",
        ghost: "font-sans text-[13px] text-brand-ink hover:bg-brand-ink/5",
        outline: "border border-brand-outline bg-transparent text-brand-ink hover:border-brand-ink",
        destructive: "border border-ds-danger-text/30 bg-white text-ds-danger-text hover:bg-ds-danger-tint",
        // Agent actions ("Generate insights"): black pill like primary. The old purple-green fade is retired.
        accent: "bg-brand-ink text-white hover:bg-black",
        link: "rounded-none font-sans text-[13px] text-brand-ink underline underline-offset-4 hover:no-underline",
      },
      size: {
        sm: "h-11 px-3.5 sm:h-8",
        md: "h-11 px-4 sm:h-9",
        lg: "h-11 px-5 sm:h-10",
        icon: "size-11 shrink-0 rounded-full font-sans sm:size-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
