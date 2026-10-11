/** Plain-text version of each output shape, for the Copy button and (loosely) what a real send would contain. */
export function toPlainText(agentKey: string, data: Record<string, unknown>): string {
  switch (agentKey) {
    case "brief_generator_agent":
      return [
        `${data.title}`,
        "",
        `Objective: ${data.objective}`,
        `Target audience: ${data.targetAudience}`,
        `Key message: ${data.keyMessage}`,
        `Tone: ${data.toneNotes}`,
        "",
        "Deliverables:",
        ...((data.deliverables as string[] | undefined) ?? []).map((d) => `- ${d}`),
        "",
        `Suggested channels: ${((data.suggestedChannels as string[] | undefined) ?? []).join(", ")}`,
        `Call to action: ${data.callToAction}`,
      ].join("\n");
    case "linkedin_post_agent":
      return [String(data.hook), "", String(data.body), "", ((data.hashtags as string[] | undefined) ?? []).map((h) => `#${h}`).join(" ")].join("\n");
    case "landing_page_copy_agent":
      return [
        String(data.headline),
        String(data.subheadline),
        "",
        ...((data.sections as { heading: string; body: string }[] | undefined) ?? []).flatMap((s) => [s.heading, s.body, ""]),
        String(data.callToAction),
      ].join("\n");
    case "instagram_caption_agent":
      return [String(data.caption), "", ((data.hashtags as string[] | undefined) ?? []).map((h) => `#${h}`).join(" "), "", `Alt text: ${data.altText}`].join("\n");
    case "email_copy_agent":
      return [
        `Subject options: ${((data.subjectLines as string[] | undefined) ?? []).join(" / ")}`,
        `Preheader: ${data.preheader}`,
        "",
        String(data.body),
      ].join("\n");
    case "ad_gen":
      return [
        `Concept: ${data.concept}`,
        `Headline: ${data.headline}`,
        `Body: ${data.bodyCopy}`,
        `Call to action: ${data.callToAction}`,
        "",
        `Caption (for posting alongside the ad): ${data.caption}`,
        "",
        `Visual direction: ${data.visualDirection}`,
        `Image prompt: ${data.imagePrompt}`,
      ].join("\n");
    case "image_gen_agent":
      return [`Concept: ${data.concept}`, "", `Image prompt: ${data.imagePrompt}`].join("\n");
    default:
      // A custom skill: { title, text } (src/lib/ai/agents/self-serve/custom-skill.ts).
      return [data.title, data.text].filter(Boolean).map(String).join("\n\n");
  }
}

