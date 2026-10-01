import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Radius 8. Primary #15171A; secondary white with a #D5D8DD border; ghost for icon/quiet actions. */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[8px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-text focus-visible:ring-offset-1 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ds-text text-white hover:bg-black",
        secondary: "border border-ds-control-border bg-white text-ds-text hover:border-ds-text-3",
        ghost: "bg-transparent text-ds-text-2 hover:bg-ds-subtle hover:text-ds-text",
      },
      size: {
        // Phones get 44px targets; the design's 32–40px heights apply from sm up.
        sm: "h-11 px-3 text-[13px] sm:h-8",
        md: "h-11 px-3.5 text-[13px] sm:h-9",
        lg: "h-11 px-4 text-[14px] sm:h-10",
        icon: "size-11 sm:size-8",
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
