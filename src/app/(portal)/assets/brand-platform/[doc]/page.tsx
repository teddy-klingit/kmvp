import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { jsonArray } from "@/lib/utils";
import { BRAND_PLATFORM_DOCS } from "@/lib/brand-iq-taxonomy";
import { EditableDoc } from "@/components/portal/editable-doc";
import { SourcesRow } from "@/components/portal/brand-sources/sources-row";
import { sectionSources } from "@/lib/brand-sources-data";
import {
  updateBrandTextDocAction,
  updateUspsAction,
  updateCoreValuesAction,
  updatePersonasAction,
} from "@/lib/actions/brand-doc-actions";

type Persona = { name: string; ageRange: string; description: string; traits: string[] };
type CoreValue = { title: string; description: string };

export default async function BrandPlatformDocPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const meta = BRAND_PLATFORM_DOCS.find((d) => d.slug === doc);
  if (!meta) notFound();

  const viewer = await getPortalViewer();
  const [client, brandOS, linked] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: viewer.clientId } }),
    prisma.brandOS.findUnique({ where: { clientId: viewer.clientId } }),
    sectionSources(viewer.clientId, doc),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">{meta.label}</h2>
      <Card className="flex flex-col gap-5 p-6">
        {renderDoc(doc, client, brandOS)}
        <SourcesRow section={doc} sources={linked.sources} connected={linked.connected} />
      </Card>
    </div>
  );
}

function renderDoc(
  doc: string,
  client: { name: string; brandSummary: string | null },
  brandOS: {
    valueProposition: string | null;
    vision: string | null;
    mission: string | null;
    coreValues: unknown;
    usps: unknown;
    competitiveNote: string | null;
    audiencePersonas: unknown;
    keyProducts: unknown;
    servicesNote: string | null;
  } | null
) {
  switch (doc) {
    case "our-brand":
      return (
        <EditableDoc action={updateBrandTextDocAction} hidden={{ doc }} initialValue={client.brandSummary ?? ""}>
          <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
            <p className="text-base font-medium text-foreground">{client.name}</p>
            <p>{client.brandSummary ?? "No summary documented yet."}</p>
            {brandOS?.valueProposition && <p>{brandOS.valueProposition}</p>}
          </div>
        </EditableDoc>
      );
    case "vision":
      return (
        <EditableDoc action={updateBrandTextDocAction} hidden={{ doc }} initialValue={brandOS?.vision ?? ""}>
          <p className="text-sm leading-relaxed text-muted-foreground">{brandOS?.vision ?? "Not documented yet."}</p>
        </EditableDoc>
      );
    case "mission":
      return (
        <EditableDoc action={updateBrandTextDocAction} hidden={{ doc }} initialValue={brandOS?.mission ?? ""}>
          <p className="text-sm leading-relaxed text-muted-foreground">{brandOS?.mission ?? "Not documented yet."}</p>
        </EditableDoc>
      );
    case "core-values": {
      const values = jsonArray<CoreValue>(brandOS?.coreValues);
      const initialValue = values.map((v) => `${v.title} | ${v.description}`).join("\n");
      return (
        <EditableDoc
          action={updateCoreValuesAction}
          hidden={{}}
          initialValue={initialValue}
          helperText="One per line — format: Title | Description"
          placeholder={"Radically transparent | No hidden fees, ever."}
        >
          {values.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not documented yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {values.map((v) => (
                <div key={v.title} className="rounded-lg bg-muted p-4">
                  <p className="text-sm font-semibold">{v.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{v.description}</p>
                </div>
              ))}
            </div>
          )}
        </EditableDoc>
      );
    }
    case "usps": {
      const usps = jsonArray<string>(brandOS?.usps);
      return (
        <EditableDoc
          action={updateUspsAction}
          hidden={{}}
          initialValue={usps.join("\n")}
          helperText="One per line"
          placeholder={"0% interest, always"}
        >
          {usps.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not documented yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              {usps.map((u) => (
                <li key={u} className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  {u}
                </li>
              ))}
            </ul>
          )}
        </EditableDoc>
      );
    }
    case "market-position":
      return (
        <EditableDoc action={updateBrandTextDocAction} hidden={{ doc }} initialValue={brandOS?.competitiveNote ?? ""}>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {brandOS?.competitiveNote ?? "Not documented yet."}
          </p>
        </EditableDoc>
      );
    case "target-audience": {
      const personas = jsonArray<Persona>(brandOS?.audiencePersonas);
      const initialValue = personas
        .map((p) => `${p.name} | ${p.ageRange} | ${p.description} | ${p.traits.join(", ")}`)
        .join("\n");
      return (
        <EditableDoc
          action={updatePersonasAction}
          hidden={{}}
          initialValue={initialValue}
          helperText="One per line — format: Name | Age range | Description | trait1, trait2, trait3"
          placeholder={"Urban Millennial Shopper | 25-34 | Mobile-first shopper | Price-conscious, Mobile-native"}
        >
          {personas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not documented yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {personas.map((p) => (
                <div key={p.name} className="rounded-lg bg-muted p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{p.name}</p>
                    <Badge tone="info">{p.ageRange}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.traits.map((t) => (
                      <Badge key={t} tone="neutral">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </EditableDoc>
      );
    }
    case "services-products": {
      const products = jsonArray<string>(brandOS?.keyProducts);
      return (
        <EditableDoc action={updateBrandTextDocAction} hidden={{ doc }} initialValue={brandOS?.servicesNote ?? ""}>
          <div className="flex flex-col gap-3">
            {brandOS?.servicesNote && <p className="text-sm text-muted-foreground">{brandOS.servicesNote}</p>}
            {products.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {products.map((p) => (
                  <Badge key={p} tone="neutral">
                    {p}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </EditableDoc>
      );
    }
    default:
      return null;
  }
}
