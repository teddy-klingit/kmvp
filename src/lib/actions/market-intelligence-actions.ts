"use server";

import { withAiCharge, assistantCharge, ASSISTANTS } from "@/lib/ai-context";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { adCampaigns } from "@/lib/metrics";
import { clientDataContext, groundedText } from "@/lib/data-context";
import { numbersIn } from "@/lib/insights/number-guard";
import { findOwnTopFormat, runMarketIntelligence } from "@/lib/market-intelligence-run";
import { getPortalViewer } from "@/lib/current-viewer";
import { jsonArray } from "@/lib/utils";
import { getRecentMarketSignals } from "@/lib/integrations/market-signals";
import { answerMarketIntelligenceQuestion } from "@/lib/ai/agents/market-intelligence-agent";

const MARKET_INTEL_PATHS = ["/insights", "/insights/market", "/insights/market/competitors", "/insights/market/trends", "/opportunities"];

function revalidateAllTabs() {
  MARKET_INTEL_PATHS.forEach((p) => revalidatePath(p));
}

export type GenerateMarketIntelligenceState = { error?: string | null };

export async function generateMarketIntelligenceAction(
  _prev: GenerateMarketIntelligenceState,
  _formData: FormData
): Promise<GenerateMarketIntelligenceState> {
  const viewer = await getPortalViewer();
  const result = await withAiCharge(assistantCharge(viewer.clientId, viewer.userId, ASSISTANTS.market), () => runMarketIntelligence(viewer.client));
  if (result.error) return result;
  revalidateAllTabs();
  return { error: null };
}

export type AskQuestionState = { error?: string | null; question?: string; answer?: string; sources?: string[]; dataSize?: string; confidence?: string | null };

export async function askMarketIntelligenceQuestionAction(
  _prev: AskQuestionState,
  formData: FormData
): Promise<AskQuestionState> {
  const viewer = await getPortalViewer();
  const client = viewer.client;
  const question = String(formData.get("question") ?? "").trim();
  if (!question) return { error: "Ask a question first." };

  const competitorBrands = jsonArray<string>(client.competitorBrands);
  // The client's own numbers from the data layer (Phase V): stored by the sync, never fetched here, and only ever
  // this client's rows. A sample account has none.
  const [signals, topFormat, campaigns, seoBrief] = await Promise.all([
    getRecentMarketSignals(client.id, { take: 15 }),
    findOwnTopFormat(client.id),
    client.paidMediaInScope && !client.isSampleAccount ? adCampaigns(client.id, 30) : Promise.resolve([]),
    prisma.seoBrief.findUnique({ where: { clientId: client.id } }),
  ]);
  const liveCampaigns = campaigns.map((c) => ({ platform: c.platform, campaignName: c.campaignName, ctr: c.ctr, impressions: c.impressions, spend: c.spend, currency: c.currency }));
  // Phase V: one context from all of the client's data (aggregates only), and what it's based on.
  const ctx = await clientDataContext(client.id);

  const result = await withAiCharge(assistantCharge(viewer.clientId, viewer.userId, ASSISTANTS.ask), () => answerMarketIntelligenceQuestion({
    clientId: client.id,
    clientName: client.name,
    industry: client.industry,
    competitorBrands,
    question,
    recentSignals: signals.map((s) => ({ title: s.title, summary: s.summary, type: s.type })),
    ownTopFormat: topFormat,
    liveCampaigns,
    seoSummary: seoBrief?.summary ?? null,
    dataContext: ctx.lines,
  }));

  if (!result.ok) return { error: result.error };

  // Numbers come from the data only: a sentence with a number that isn't in it (or a ratio of two of its numbers) is
  // dropped, and the answer says so.
  const pool = [...ctx.pool, ...numbersIn(question), ...numbersIn(signals.map((x) => `${x.title} ${x.summary}`).join(" ")), ...(topFormat ? [topFormat.ctr] : [])];
  const checked = groundedText(result.data.answer, pool);
  const answer = checked.text ? `${checked.text}${checked.dropped ? "\n\n(Some figures were left out: they couldn't be checked against your data.)" : ""}` : "I can't answer that from your data yet: the numbers it needs aren't in what's connected.";
  await prisma.marketIntelligenceQuestion.create({
    data: { clientId: client.id, question, answer, sources: ctx.sources, dataSize: ctx.size, confidence: ctx.confidence },
  });

  revalidateAllTabs();
  return { error: null, question, answer, sources: ctx.sources, dataSize: ctx.size, confidence: ctx.confidence };
}

export async function addSuggestedCompetitorAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "");

  const current = jsonArray<string>(viewer.client.competitorBrands);
  if (!current.some((b) => b.toLowerCase() === name.toLowerCase())) {
    await prisma.client.update({ where: { id: viewer.clientId }, data: { competitorBrands: [...current, name] } });
  }
  await prisma.suggestedCompetitor.update({ where: { id }, data: { status: "ADDED" } });

  revalidateAllTabs();
}

export async function dismissSuggestedCompetitorAction(formData: FormData) {
  await getPortalViewer();
  const id = String(formData.get("id") ?? "");
  await prisma.suggestedCompetitor.update({ where: { id }, data: { status: "DISMISSED" } });
  revalidateAllTabs();
}

/** "Track another brand": adds a competitor by name or website (checked from the next Market visit on). */
export async function trackCompetitorAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const raw = String(formData.get("brand") ?? "").trim();
  const name = raw.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").slice(0, 80);
  if (!name) return;
  const current = jsonArray<string>(viewer.client.competitorBrands);
  if (!current.some((b) => b.toLowerCase() === name.toLowerCase())) {
    await prisma.client.update({ where: { id: viewer.clientId }, data: { competitorBrands: [...current, name] } });
  }
  revalidateAllTabs();
}
