import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card } from "@/components/ui/card";
import { BRAND_PLATFORM_DOCS } from "@/lib/brand-iq-taxonomy";
import { FileText } from "lucide-react";

export default async function BrandPlatformPage() {
  const viewer = await getPortalViewer();
  const [client, brandOS] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: viewer.clientId } }),
    prisma.brandOS.findUnique({ where: { clientId: viewer.clientId } }),
  ]);

  const teaserFor: Record<string, string | null | undefined> = {
    "our-brand": client.brandSummary ?? brandOS?.valueProposition,
    vision: brandOS?.vision,
    mission: brandOS?.mission,
    "core-values": brandOS?.coreValues ? "The principles behind every decision" : null,
    usps: brandOS?.usps ? "What sets us apart" : null,
    "market-position": brandOS?.competitiveNote,
    "target-audience": brandOS?.audiencePersonas ? "Who we're building and speaking for" : null,
    "services-products": brandOS?.servicesNote,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Brand &amp; Message platform</h2>
        <p className="text-sm text-muted-foreground">
          The story behind {client.name} — what it stands for, who it's for, and what it offers.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {BRAND_PLATFORM_DOCS.map((doc, i) => (
          <Link
            key={doc.slug}
            href={`/assets/brand-platform/${doc.slug}`}
            className="animate-in fade-in slide-in-from-bottom-1 duration-300"
            style={{ animationDelay: `${i * 40}ms`, animationFillMode: "backwards" }}
          >
            <Card className="flex h-full flex-col gap-2 p-5 transition-colors hover:border-ink/30">
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
                <FileText className="size-4" />
              </span>
              <p className="text-sm font-semibold">{doc.label}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {teaserFor[doc.slug] ?? "Not documented yet."}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
