import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Who pays for the AI calls made while this runs. A client-triggered server action (Ask your data, the Brief
 * assistant, a skill run, …) wraps its work in withAiCharge; runAgentTask reads it and charges the client's AI
 * credits from the real token counts. Anything outside a context — scheduled jobs, autopilot, staff actions,
 * Klingit's quality check — is Klingit's own production work and never charges a client.
 */
export type AiChargeContext = {
  clientId: string;
  userId?: string | null;
  sourceType: "skill" | "assistant";
  sourceKey: string;
  sourceName: string;
  projectId?: string | null;
  format?: string | null;
};

const store = new AsyncLocalStorage<AiChargeContext>();

export function withAiCharge<T>(ctx: AiChargeContext, fn: () => Promise<T>): Promise<T> {
  return store.run(ctx, fn);
}

export function currentAiCharge(): AiChargeContext | undefined {
  return store.getStore();
}

/** The built-in assistants as the client sees them (Skills → Built-in assistants, Usage). */
export const ASSISTANTS = {
  brief: { sourceKey: "brief_agent", sourceName: "Brief assistant" },
  ask: { sourceKey: "ask_your_data", sourceName: "Ask your data" },
  market: { sourceKey: "market_intel_agent", sourceName: "Market ideas" },
  performance: { sourceKey: "performance_agent", sourceName: "Performance insights" },
  seo: { sourceKey: "seo_agent", sourceName: "SEO & AI visibility check" },
  contentPlan: { sourceKey: "content_plan_agent", sourceName: "Content plan ideas" },
  brandDraft: { sourceKey: "brand_os", sourceName: "Brand OS drafting" },
  ruleCheck: { sourceKey: "rule_check", sourceName: "Rule check" },
  ruleImport: { sourceKey: "rule_import", sourceName: "Guidelines import" },
} as const;

export const assistantCharge = (clientId: string, userId: string | null | undefined, a: (typeof ASSISTANTS)[keyof typeof ASSISTANTS], extra: Partial<AiChargeContext> = {}): AiChargeContext => ({
  clientId,
  userId,
  sourceType: "assistant",
  ...a,
  ...extra,
});
