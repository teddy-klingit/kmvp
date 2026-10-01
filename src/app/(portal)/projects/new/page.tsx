import { BriefIntakeForm } from "@/components/portal/brief-intake-form";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ idea?: string; detail?: string }>;
}) {
  const { idea, detail } = await searchParams;
  const prefill = idea ? `${idea}\n\n${detail ?? ""}`.trim() : undefined;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 font-display text-xl font-light tracking-tight">New project</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        No forms to fill in yet — just tell us what you need and we&apos;ll take it from there.
      </p>
      <BriefIntakeForm prefill={prefill} />
    </div>
  );
}
