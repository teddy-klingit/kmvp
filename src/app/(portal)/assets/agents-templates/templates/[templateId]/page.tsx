import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { SectionCard, CardBody } from "@/components/ds/card";
import { PageGrid } from "@/components/ds/page-grid";
import { Button } from "@/components/ds/button";
import { formatDate } from "@/lib/utils";

export default async function TemplatePreviewPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link href="/assets/agents-templates/templates" className="-ml-1 inline-flex min-h-11 items-center gap-1 self-start text-[13px] text-brand-ink-2 no-underline hover:text-brand-ink sm:min-h-0">
        <ChevronLeft className="size-4" strokeWidth={1.75} />
        All templates
      </Link>
      <PageGrid
        main={
          <SectionCard
            title={template.name}
            meta={
              <span className="font-brand-mono text-[12px] text-brand-ink-2">
                {template.category.toUpperCase()} · UPDATED {formatDate(template.createdAt).toUpperCase()} · USED {template.usageCount}×
              </span>
            }
            action={
              template.figmaUrl ? (
              <Button asChild variant="primary" size="md">
                <a href={template.figmaUrl} target="_blank" rel="noreferrer" className="no-underline">
                  Open in Figma
                </a>
              </Button>
              ) : undefined
            }
          >
            <CardBody>
              <div className="flex aspect-video w-full items-center justify-center rounded-[10px] text-white" style={{ backgroundColor: template.previewColor }}>
                <span className="text-[36px] font-light opacity-70">F</span>
              </div>
            </CardBody>
          </SectionCard>
        }
        side={
          <SectionCard title="About this template">
            <p className="m-0 px-6 py-5 text-[14px] leading-[1.55] text-brand-ink-2">
              A master template built to your brand specs — pull it directly into a new brief, or open it in Figma to duplicate and customize.
            </p>
          </SectionCard>
        }
      />
    </div>
  );
}
