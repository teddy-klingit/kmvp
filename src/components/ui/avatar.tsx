"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn, avatarColorFor, initialsFor } from "@/lib/utils";

const sizeClasses = {
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
};

/** Colored initials avatar, deterministic per name — matches the mockups'
 * avatar-initial badges (e.g. "JR" pink, "TW" orange). */
function PersonAvatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof sizeClasses;
  className?: string;
}) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white",
        sizeClasses[size],
        className
      )}
      style={{ backgroundColor: avatarColorFor(name) }}
    >
      <AvatarPrimitive.Fallback>{initialsFor(name)}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

/** Real brand logo when a domain is known (via a domain-based logo service), falling back to
 * the colored initials badge if there's no domain on file or the image fails to load. */
function BrandAvatar({
  name,
  domain,
  size = "md",
  className,
}: {
  name: string;
  domain?: string;
  size?: keyof typeof sizeClasses;
  className?: string;
}) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white font-semibold text-white",
        sizeClasses[size],
        className
      )}
      style={{ backgroundColor: avatarColorFor(name) }}
    >
      {domain && (
        <AvatarPrimitive.Image
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
          alt={name}
          className="size-full object-contain p-1"
        />
      )}
      <AvatarPrimitive.Fallback delayMs={domain ? 400 : 0}>{initialsFor(name)}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export { PersonAvatar, BrandAvatar };
