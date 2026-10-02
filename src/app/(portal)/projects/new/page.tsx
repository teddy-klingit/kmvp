import { PageHeader } from "@/components/ds/page-header";
import { BriefIntakeForm } from "@/components/portal/brief-intake-form";

/** New project: one free-text brief; Klingit names the project and asks what's missing. */
export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ idea?: string; detail?: string }>;
}) {
  const { idea, detail } = await searchParams;
  const prefill = idea ? `${idea}\n\n${detail ?? ""}`.trim() : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={{ href: "/projects", label: "Projects" }} eyebrow="Start a brief" title="New project" />
      <div className="flex w-full max-w-[720px] flex-col gap-4">
        <p className="m-0 text-[15px] text-brand-ink-2">No forms to fill in yet — just tell us what you need and we&apos;ll take it from there.</p>
        <BriefIntakeForm prefill={prefill} />
      </div>
    </div>
  );
}
