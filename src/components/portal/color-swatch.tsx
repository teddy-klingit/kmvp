"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { hexToCmyk } from "@/lib/utils";

export function ColorSwatch({ hex, name, showCmyk = false }: { hex: string; name?: string; showCmyk?: boolean }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(hex);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex flex-col items-center gap-2"
    >
      <span
        className="flex size-16 items-center justify-center rounded-xl border border-border shadow-sm transition-transform hover:scale-105"
        style={{ backgroundColor: hex }}
      >
        {copied && (
          <span className="flex size-6 items-center justify-center rounded-full bg-black/30 text-white">
            <Check className="size-3.5" />
          </span>
        )}
      </span>
      <div className="flex flex-col items-center gap-0.5">
        {name && <span className="text-xs font-medium text-foreground">{name}</span>}
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {copied ? "Copied!" : hex.toUpperCase()}
          {!copied && <Copy className="size-3" />}
        </span>
        {showCmyk && <span className="text-[11px] text-muted-foreground">CMYK {hexToCmyk(hex)}</span>}
      </div>
    </button>
  );
}
