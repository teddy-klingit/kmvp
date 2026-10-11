import { jsonArray } from "@/lib/utils";

/**
 * What each skill's run page asks (Phase R, design 03): formats and channels as chips (never free text), whether
 * "Start from" applies, and whether it makes 1–4 versions. Custom skills use DEFAULT_FORM.
 */
export type SkillForm = { formats?: string[]; channels?: string[]; startFrom?: boolean; versions: boolean; say: string; sayPlaceholder: string };

const AD_CHANNELS = ["Instagram", "TikTok", "Facebook", "Pinterest", "LinkedIn"];
export const DEFAULT_FORM: SkillForm = { versions: true, say: "What should it say?", sayPlaceholder: "What it's for, and the one thing it must get across." };

export const SKILL_FORMS: Record<string, SkillForm> = {
  ad_gen: { formats: ["Story 9:16", "Feed 4:5", "Square 1:1", "Landscape 16:9"], channels: AD_CHANNELS, startFrom: true, versions: true, say: "What should it say?", sayPlaceholder: "restock announcement. dew drop is back, calm and soft, no urgency tricks." },
  carousel_builder: { formats: ["Carousel 4:5", "Carousel 1:1"], channels: ["Instagram", "LinkedIn", "Facebook"], startFrom: true, versions: true, say: "What's the story?", sayPlaceholder: "four steps to a calm evening routine with milk wash and cloud cream." },
  image_gen_agent: { formats: ["Square 1:1", "Story 9:16", "Feed 4:5", "Landscape 16:9"], versions: true, say: "What should the image show?", sayPlaceholder: "dew drop on a bathroom shelf in soft morning light, no text." },
  instagram_caption_agent: { channels: ["Instagram"], versions: true, say: "What's the post about?", sayPlaceholder: "the milk wash restock, gentle and low-foam." },
  linkedin_post_agent: { channels: ["LinkedIn"], versions: true, say: "What's the post about?", sayPlaceholder: "why we only make refillable packaging." },
  email_copy_agent: { channels: ["Email"], versions: true, say: "What's the email about?", sayPlaceholder: "sun day launch email for subscribers, with the SPF claim." },
  landing_page_copy_agent: { channels: ["Web"], versions: true, say: "What's the page for?", sayPlaceholder: "the cloud cream product page." },
  brief_generator_agent: { versions: false, say: "What's the idea?", sayPlaceholder: "a TikTok series about real morning routines." },
};
export const formFor = (key: string) => SKILL_FORMS[key] ?? DEFAULT_FORM;

/** Brand OS products ("cloud cream · face cream") by name, for the product chips. */
export function brandProducts(keyProducts: unknown) {
  return jsonArray<string>(keyProducts)
    .map((p) => {
      const [name, type] = p.split(" · ").map((x) => x.trim());
      return { name, type: type ?? null };
    })
    .filter((p) => p.name);
}
