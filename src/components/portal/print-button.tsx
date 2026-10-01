"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Browser print-to-PDF — the fastest reliable way to hand someone an
 * exportable copy of a filtered report without building a PDF pipeline. */
export function PrintButton() {
  return (
    <Button type="button" variant="secondary" size="sm" className="gap-1.5 print:hidden" onClick={() => window.print()}>
      <Printer className="size-3.5" />
      Print / Save as PDF
    </Button>
  );
}
