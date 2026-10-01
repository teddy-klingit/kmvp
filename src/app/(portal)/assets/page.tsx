import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { jsonArray, initialsFor } from "@/lib/utils";
import { DownloadBrandButton } from "@/components/portal/download-brand-button";

type Persona = { name: string; ageRange: string; description: string; traits: string[] };
type VoiceAttribute = { label: string; leftLabel: string; rightLabel: string; value: number };

export default async function BrandOSOverviewPage() {
  const viewer = await getPortalViewer();
  const [client, brandOS, brandAssets] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: viewer.clientId } }),
    prisma.brandOS.findUnique({ where: { clientId: viewer.clientId } }),
    prisma.brandAsset.findMany({ where: { clientId: viewer.clientId } }),
  ]);

  const personas = jsonArray<Persona>(brandOS?.audiencePersonas);
  const voiceAttributes = jsonArray<VoiceAttribute>(brandOS?.voiceAttributes);
  const keyProducts = jsonArray<string>(brandOS?.keyProducts);
  const colors = jsonArray<string>(brandOS?.approvedColors);
  const photography = brandAssets.filter((a) => a.category === "PHOTOGRAPHY");
  const illustrations = brandAssets.filter((a) => a.category === "ILLUSTRATION");
  const primaryColor = colors[0] ?? "var(--primary)";
  const secondaryColor = colors[1] ?? "var(--accent)";

  const voicePersonality = voiceAttributes
    .map((v) => (v.value >= 55 ? v.rightLabel : v.leftLabel))
    .filter(Boolean);

  return (
    <div className="flex flex-col gap-8">
      <Card
        className="relative overflow-hidden p-6"
        style={{ background: `linear-gradient(135deg, ${primaryColor}1a, ${secondaryColor}0d)` }}
      >
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <span
              className="flex size-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-sm"
              style={{ backgroundColor: primaryColor }}
            >
              {initialsFor(client.name)}
            </span>
            <div>
              <h2 className="font-display text-xl font-light">{client.name}</h2>
              <p className="max-w-xl text-sm text-muted-foreground">
                {client.brandSummary ?? brandOS?.valueProposition ?? "Brand profile being built out."}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {colors.length > 0 && (
              <div className="flex -space-x-2">
                {colors.slice(0, 5).map((c) => (
                  <span
                    key={c}
                    className="size-8 rounded-full border-2 border-card shadow-sm"
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            )}
            <DownloadBrandButton clientName={client.name} />
          </div>
        </div>
        {voicePersonality.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {voicePersonality.map((label) => (
              <Badge key={label} tone="accent">
                {label}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      <p className="-mt-4 text-sm text-muted-foreground">
        Everything every Klingit agent reads before producing a single asset — product, audience, voice, and visual
        style.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <SectionLabel>Company &amp; product</SectionLabel>
          <Card className="flex flex-col gap-3 p-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Industry</p>
              <p className="text-sm">{client.industry ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Value proposition</p>
              <p className="text-sm">{brandOS?.valueProposition ?? "Not documented yet."}</p>
            </div>
            {keyProducts.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Key products</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {keyProducts.map((p) => (
                    <Badge key={p} tone="neutral">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Voice &amp; tone</SectionLabel>
          <Card className="flex flex-col gap-4 p-5">
            {voiceAttributes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not documented yet.</p>
            ) : (
              voiceAttributes.map((v) => (
                <div key={v.label} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className={v.value < 45 ? "font-semibold text-foreground" : ""}>{v.leftLabel}</span>
                    <span className={v.value >= 55 ? "font-semibold text-foreground" : ""}>{v.rightLabel}</span>
                  </div>
                  <div className="relative h-1.5 w-full rounded-full bg-eggshell">
                    <div
                      className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-paper bg-ink transition-all"
                      style={{ left: `calc(${v.value}% - 6px)` }}
                    />
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>
      </div>

      {personas.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Audience personas</SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {personas.map((p, i) => (
              <Card
                key={p.name}
                className="flex flex-col gap-2 overflow-hidden p-0 transition-colors hover:border-ink/30"
              >
                <div
                  className="h-16"
                  style={{
                    background: `linear-gradient(135deg, ${colors[i % Math.max(colors.length, 1)] ?? primaryColor}, ${colors[(i + 1) % Math.max(colors.length, 1)] ?? secondaryColor})`,
                  }}
                />
                <div className="flex flex-col gap-2 p-5 pt-0">
                  <div className="-mt-6 flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-full border-2 border-card bg-card text-sm font-semibold shadow-sm">
                      {initialsFor(p.name)}
                    </span>
                    <Badge tone="info">{p.ageRange}</Badge>
                  </div>
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="text-sm text-muted-foreground">{p.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.traits.map((t) => (
                      <Badge key={t} tone="neutral">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StyleCard
          title="Imagery style"
          description={brandOS?.imageryStyle}
          assets={photography}
          colors={colors}
          variant="photo"
        />
        <StyleCard
          title="Illustration style"
          description={brandOS?.illustrationStyle}
          assets={illustrations}
          colors={colors}
          variant="illustration"
        />
      </div>

      {brandOS?.competitiveNote && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Market position</SectionLabel>
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">{brandOS.competitiveNote}</p>
          </Card>
        </div>
      )}
    </div>
  );
}

function StyleCard({
  title,
  description,
  assets,
  colors,
  variant,
}: {
  title: string;
  description: string | null | undefined;
  assets: { id: string; previewColor: string; name: string; fileUrl?: string | null }[];
  colors: string[];
  variant: "photo" | "illustration";
}) {
  const tileCount = 6;
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>{title}</SectionLabel>
      <Card className="flex flex-col gap-3 p-5">
        <p className="text-sm text-muted-foreground">{description ?? "Not documented yet."}</p>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: tileCount }).map((_, i) => {
            const asset = assets[i];
            const base = asset?.previewColor ?? colors[i % Math.max(colors.length, 1)] ?? "var(--muted)";
            const next = colors[(i + 2) % Math.max(colors.length, 1)] ?? base;
            if (asset?.fileUrl) {
              return (
                <div key={asset.id} className="aspect-square overflow-hidden rounded-lg bg-muted" title={asset.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.fileUrl} alt={asset.name} className="size-full object-cover" />
                </div>
              );
            }
            return (
              <div
                key={asset?.id ?? i}
                className="aspect-square overflow-hidden rounded-lg"
                style={
                  variant === "photo"
                    ? { background: `linear-gradient(160deg, ${base}, ${next})` }
                    : {
                        backgroundColor: base,
                        backgroundImage: `radial-gradient(${next} 22%, transparent 23%), radial-gradient(${next} 22%, transparent 23%)`,
                        backgroundPosition: "0 0, 50% 50%",
                        backgroundSize: "18px 18px",
                      }
                }
              />
            );
          })}
        </div>
      </Card>
    </div>
  );
}
