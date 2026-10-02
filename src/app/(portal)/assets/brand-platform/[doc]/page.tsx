import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { jsonArray } from "@/lib/utils";
import { BRAND_PLATFORM_DOCS } from "@/lib/brand-iq-taxonomy";
import { platformStatus, PLATFORM_SECTIONS, SECTION_READERS } from "@/lib/brand-completeness";
import { EditableDoc } from "@/components/portal/editable-doc";
import { SourcesRow } from "@/components/portal/brand-sources/sources-row";
import { sectionSources } from "@/lib/brand-sources-data";
import { updateBrandTextDocAction, updateUspsAction, updateCoreValuesAction, updatePersonasAction } from "@/lib/actions/brand-doc-actions";
import { rewriteSectionAction } from "@/lib/actions/brand-draft-actions";
import { PageHeader } from "@/components/ds/page-header";
import { PageGrid } from "@/components/ds/page-grid";
import { Card, SectionCard } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { AgentButton } from "@/components/portal/insights/agent-button";
import { PlatformList } from "@/components/portal/platform-list";

type Persona = { name: string; ageRange: string; description: string; traits: string[] };
type CoreValue = { title: string; description: string };
type Common = { title: string; helperText: string; draft: { id: string; content: string; basis: string | null } | null; rewrite: React.ReactNode; footer: React.ReactNode };

const empty = <p className="m-0 text-[15px] text-brand-ink-2">Not written yet.</p>;

/** "Brief, Estimate and Ad concepts" */
function list(names: string[]) {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
}

/**
 * A Brand IQ platform section (BrandSection.dc.html): breadcrumb, "BRAND & MESSAGE PLATFORM · i OF 8", the
 * section in the standard editor with its question, Save / Cancel / Rewrite with AI and its source chips.
 * Side: every section with its status, and which agents read this one.
 */
export default async function BrandPlatformDocPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const meta = BRAND_PLATFORM_DOCS.find((d) => d.slug === doc);
  const section = PLATFORM_SECTIONS.find((s) => s.slug === doc);
  if (!meta || !section) notFound();

  const viewer = await getPortalViewer();
  const [client, brandOS, linked, draft] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: viewer.clientId } }),
    prisma.brandOS.findUnique({ where: { clientId: viewer.clientId } }),
    sectionSources(viewer.clientId, doc),
    prisma.brandSectionDraft.findFirst({ where: { clientId: viewer.clientId, section: doc, status: "PENDING" }, orderBy: { createdAt: "desc" } }),
  ]);
  const status = platformStatus({ brandSummary: client.brandSummary, brandOS });
  const index = status.sections.findIndex((s) => s.slug === doc) + 1;
  const readers = SECTION_READERS[doc] ?? [];

  const common: Common = {
    title: meta.label,
    helperText: section.prompt,
    draft: draft ? { id: draft.id, content: draft.content, basis: draft.basis } : null,
    rewrite: <AgentButton action={rewriteSectionAction} fields={{ section: doc }} label="Rewrite with AI" pendingLabel="Drafting…" />,
    footer: <SourcesRow section={doc} sources={linked.sources} connected={linked.connected} />,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={{ href: "/assets/brand-platform", label: "Brand IQ · Platform" }} eyebrow={`Brand & message platform · ${index} of ${status.total}`} title={meta.label} />
      <PageGrid
        main={<Card className="overflow-hidden">{renderDoc(doc, client, brandOS, common)}</Card>}
        side={
          <>
            <SectionCard title="Platform sections" action={<span className="font-brand-mono text-[12px] text-brand-ink-2">{status.done} OF {status.total}</span>}>
              <PlatformList sections={status.sections} drafted={new Set()} current={doc} />
            </SectionCard>
            <Card tone="muted" aria-label="Used by agents" className="flex flex-col gap-2 px-6 py-5">
              <span className="text-[16px]">Used by {readers.length} agents</span>
              <span className="text-[13px] leading-[1.55] text-brand-ink-2">{list(readers)} read this section and its sources when they work on your projects.</span>
            </Card>
          </>
        }
      />
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
  } | null,
  common: Common
) {
  switch (doc) {
    case "our-brand":
      return (
        <EditableDoc {...common} action={updateBrandTextDocAction} hidden={{ doc }} initialValue={client.brandSummary ?? ""}>
          {client.brandSummary ? (
            <div className="flex flex-col gap-3 text-[16px] leading-relaxed">
              <p className="m-0">{client.brandSummary}</p>
              {brandOS?.valueProposition && <p className="m-0 text-brand-ink-2">{brandOS.valueProposition}</p>}
            </div>
          ) : (
            empty
          )}
        </EditableDoc>
      );
    case "vision":
      return (
        <EditableDoc {...common} action={updateBrandTextDocAction} hidden={{ doc }} initialValue={brandOS?.vision ?? ""}>
          {brandOS?.vision ? <p className="m-0 text-[16px] leading-relaxed">{brandOS.vision}</p> : empty}
        </EditableDoc>
      );
    case "mission":
      return (
        <EditableDoc {...common} action={updateBrandTextDocAction} hidden={{ doc }} initialValue={brandOS?.mission ?? ""}>
          {brandOS?.mission ? <p className="m-0 text-[16px] leading-relaxed">{brandOS.mission}</p> : empty}
        </EditableDoc>
      );
    case "core-values": {
      const values = jsonArray<CoreValue>(brandOS?.coreValues);
      const initialValue = values.map((v) => `${v.title} | ${v.description}`).join("\n");
      return (
        <EditableDoc
          {...common}
          action={updateCoreValuesAction}
          hidden={{}}
          initialValue={initialValue}
          helperText="One per line — format: Title | Description"
          placeholder={"Radically transparent | No hidden fees, ever."}
        >
          {values.length === 0 ? (
            empty
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {values.map((v) => (
                <div key={v.title} className="rounded-[10px] bg-brand-chip p-4">
                  <p className="m-0 text-[15px] font-semibold">{v.title}</p>
                  <p className="m-0 mt-1 text-[14px] text-brand-ink-2">{v.description}</p>
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
          {...common}
          action={updateUspsAction}
          hidden={{}}
          initialValue={usps.join("\n")}
          helperText="One per line"
          placeholder={"0% interest, always"}
        >
          {usps.length === 0 ? (
            empty
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[15px]">
              {usps.map((u) => (
                <li key={u} className="flex items-start gap-2.5">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-ink" />
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
        <EditableDoc {...common} action={updateBrandTextDocAction} hidden={{ doc }} initialValue={brandOS?.competitiveNote ?? ""}>
          {brandOS?.competitiveNote ? <p className="m-0 text-[16px] leading-relaxed">{brandOS.competitiveNote}</p> : empty}
        </EditableDoc>
      );
    case "target-audience": {
      const personas = jsonArray<Persona>(brandOS?.audiencePersonas);
      const initialValue = personas
        .map((p) => `${p.name} | ${p.ageRange} | ${p.description} | ${p.traits.join(", ")}`)
        .join("\n");
      return (
        <EditableDoc
          {...common}
          action={updatePersonasAction}
          hidden={{}}
          initialValue={initialValue}
          helperText="One per line — format: Name | Age range | Description | trait1, trait2, trait3"
          placeholder={"Urban Millennial Shopper | 25-34 | Mobile-first shopper | Price-conscious, Mobile-native"}
        >
          {personas.length === 0 ? (
            empty
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {personas.map((p) => (
                <div key={p.name} className="rounded-[10px] bg-brand-chip p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="m-0 text-[15px] font-semibold">{p.name}</p>
                    <StatusPill>{p.ageRange}</StatusPill>
                  </div>
                  <p className="m-0 mt-1 text-[14px] text-brand-ink-2">{p.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.traits.map((t) => (
                      <StatusPill key={t}>{t}</StatusPill>
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
        <EditableDoc {...common} action={updateBrandTextDocAction} hidden={{ doc }} initialValue={brandOS?.servicesNote ?? ""}>
          {!brandOS?.servicesNote && products.length === 0 ? (
            empty
          ) : (
            <div className="flex flex-col gap-3">
              {brandOS?.servicesNote && <p className="m-0 text-[16px] leading-relaxed">{brandOS.servicesNote}</p>}
              {products.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {products.map((p) => (
                    <StatusPill key={p}>{p}</StatusPill>
                  ))}
                </div>
              )}
            </div>
          )}
        </EditableDoc>
      );
    }
    default:
      return null;
  }
}
