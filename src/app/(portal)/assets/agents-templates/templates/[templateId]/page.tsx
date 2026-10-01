import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export default async function TemplatePreviewPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/assets/agents-templates/templates" className="text-sm text-primary hover:underline">
        &lt; All templates
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-light">{template.name}</h1>
          <p className="text-sm text-muted-foreground">
            {template.category} · Updated {formatDate(template.createdAt)} · Used {template.usageCount}×
          </p>
        </div>
        <Button asChild>
          <a href={template.figmaUrl ?? "#"} target="_blank" rel="noreferrer">
            Open in Figma
          </a>
        </Button>
      </div>

      <div
        className="flex aspect-video w-full items-center justify-center rounded-xl text-white"
        style={{ backgroundColor: template.previewColor }}
      >
        <span className="font-display text-4xl font-light opacity-70">F</span>
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel>About this template</SectionLabel>
        <Card className="p-5 text-sm text-muted-foreground">
          A master template built to your brand specs — pull it directly into a new brief, or open it in Figma to
          duplicate and customize.
        </Card>
      </div>
    </div>
  );
}
