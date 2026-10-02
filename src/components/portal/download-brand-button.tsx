"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getBrandExportText } from "@/lib/actions/brand-export-actions";

export function DownloadBrandButton({ clientName }: { clientName: string }) {
  const [pending, setPending] = useState(false);

  async function handleDownload() {
    setPending(true);
    try {
      const text = await getBrandExportText();
      const blob = new Blob([text], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${clientName.replace(/\s+/g, "-").toLowerCase()}-brand-guide.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button size="lg" variant="secondary" onClick={handleDownload} disabled={pending}>
      {pending ? "Preparing…" : "Download brand kit"}
    </Button>
  );
}
