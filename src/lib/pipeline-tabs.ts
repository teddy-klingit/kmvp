import type { PipelineStageName } from "@/generated/prisma";

export type StageSlug =
  | "foundation"
  | "brief"
  | "estimate"
  | "staffing"
  | "production"
  | "qa"
  | "delivery"
  | "feedback"
  | "final"
  | "archive";

export const STAGE_TABS: { slug: StageSlug; label: string; stage?: PipelineStageName }[] = [
  { slug: "foundation", label: "Foundation" },
  { slug: "brief", label: "Brief", stage: "BRIEF" },
  { slug: "estimate", label: "Estimate", stage: "ESTIMATE" },
  { slug: "staffing", label: "Staffing", stage: "STAFFING" },
  { slug: "production", label: "Production", stage: "PRODUCTION" },
  { slug: "qa", label: "QA", stage: "QA" },
  { slug: "delivery", label: "Delivery", stage: "FIRST_DRAFT_DELIVERY" },
  { slug: "feedback", label: "Feedback", stage: "FEEDBACK" },
  { slug: "final", label: "Final", stage: "FINAL_DELIVERY" },
  { slug: "archive", label: "Archive", stage: "ARCHIVE_LEARN_MEASURE" },
];

export function stageSlugForName(name: PipelineStageName): StageSlug {
  return STAGE_TABS.find((t) => t.stage === name)?.slug ?? "foundation";
}
