import { jsonArray } from "@/lib/utils";
import type { BrandOS } from "@/generated/prisma";

export type BriefQuestionKey = "goals" | "targetAudience" | "successMetrics" | "references";

// Deliberately generic — a project here can be an ad campaign, a single
// asset, a deck, a motion piece, a dev/build request, brand work, or
// anything else a client asks for, so the questions can't assume "campaign".
// Each question ships with quick-answer presets so clients can tap through
// the brief instead of typing every field out.
export const BRIEF_QUESTIONS: {
  key: BriefQuestionKey;
  question: string;
  placeholder: string;
  presets: string[];
}[] = [
  {
    key: "goals",
    question: "What do you need, and what's it for?",
    placeholder: "e.g. A 10-slide investor deck for our Series B raise",
    presets: ["Drive awareness", "Drive sign-ups / installs", "Launch something new", "Refresh our presence", "Internal / stakeholder update"],
  },
  {
    key: "targetAudience",
    question: "Who's this for?",
    placeholder: "e.g. Urban millennials, mobile-first — or 'our board and investors'",
    presets: ["Existing customers", "New sign-ups", "Gen Z / younger", "Business / B2B", "General public"],
  },
  {
    key: "successMetrics",
    question: "What does success look like?",
    placeholder: "Share a KPI, a deadline, or simply what 'done well' means here",
    presets: ["CTR", "Installs / sign-ups", "Awareness lift", "Engagement", "Quality only — no hard KPI"],
  },
  {
    key: "references",
    question: "Any references or examples you love?",
    placeholder: "Share links, files, or describe the style and feel you're going for",
    presets: ["Similar to our last project", "Bold and modern", "Minimal and clean", "No specific reference"],
  },
];

/** The fixed question list, minus any question the client's BrandOS already
 * answers — e.g. "Who's this for?" is redundant once real audience personas
 * are on file, so don't make every single project re-ask it. */
export function getEffectiveBriefQuestions(brandOS: BrandOS | null) {
  const hasAudiencePersonas = jsonArray(brandOS?.audiencePersonas).length > 0;
  return BRIEF_QUESTIONS.filter((q) => !(q.key === "targetAudience" && hasAudiencePersonas));
}
