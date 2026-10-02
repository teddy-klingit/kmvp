"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ds/button";

/** Browser print-to-PDF — the fastest reliable way to hand someone an
 * exportable copy of a filtered report without building a PDF pipeline. */
export function PrintButton() {
  return (
    <Button type="button" variant="secondary" size="sm" className="print:hidden" onClick={() => window.print()}>
      <Printer strokeWidth={1.75} />
      Print / Save as PDF
    </Button>
  );
}
