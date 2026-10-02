import { redirect } from "next/navigation";

/** Old entry point: every new project starts in the Brief studio, with any idea passed along as the first message. */
export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ idea?: string; detail?: string }> }) {
  const { idea, detail } = await searchParams;
  const q = idea ? `${idea}\n\n${detail ?? ""}`.trim() : "";
  redirect(q ? `/brief/new?${new URLSearchParams({ q })}` : "/brief/new");
}
