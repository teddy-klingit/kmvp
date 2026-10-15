import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "@/lib/ai/client";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/platform-settings";
import { aiPrices, costUsd, modelFor } from "@/lib/ai-cost";
import { reportPrompt, ReportSchema } from "@/lib/ai/agents/report-agent";
import { periodFor, prepareReport, saveReport, type Period } from "@/lib/report-data";

/**
 * Scheduled reports through Anthropic's Batch API (Phase U cost control): half price, results within hours (often
 * minutes). The scheduler submits every due report in one batch, then collects it on a later tick: each result is
 * saved like an immediate run and logged as a performance_agent run with its batch-price cost.
 */

type Item = { clientId: string; kind: "WEEKLY" | "MONTHLY"; periodStart: string; topAssetIds: string[] };
const idOf = (i: { clientId: string; kind: string; periodStart: string }) => `${i.clientId}|${i.kind}|${i.periodStart}`.slice(0, 64);

/** Report keys already waiting in a batch, so a tick never sends the same report twice. */
export async function pendingReportKeys() {
  const jobs = await prisma.aiBatchJob.findMany({ where: { kind: "report", status: "submitted" }, select: { payload: true } });
  return new Set(jobs.flatMap((j) => (j.payload as { items: Item[] }).items.map(idOf)));
}

export async function submitReportBatch(due: { clientId: string; period: Period }[]) {
  const pending = await pendingReportKeys();
  const model = await modelFor("performance_agent");
  const cache = await getSetting("promptCaching");
  const items: Item[] = [];
  const requests = [];
  for (const d of due) {
    const item = { clientId: d.clientId, kind: d.period.kind, periodStart: d.period.start.toISOString() };
    if (pending.has(idOf(item))) continue;
    const prep = await prepareReport(d.clientId, d.period);
    if (!prep.ok) continue;
    const { system, prompt } = reportPrompt(prep.args);
    items.push({ ...item, topAssetIds: prep.topAssetIds });
    requests.push({
      custom_id: idOf(item).replace(/[^a-zA-Z0-9_-]/g, "_"),
      params: { model, max_tokens: 4096, system: cache ? [{ type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } }] : system, messages: [{ role: "user" as const, content: prompt }], output_config: { format: zodOutputFormat(ReportSchema) } },
    });
  }
  if (!requests.length) return 0;
  const batch = await anthropic.messages.batches.create({ requests } as unknown as Parameters<typeof anthropic.messages.batches.create>[0]);
  await prisma.aiBatchJob.create({ data: { batchId: batch.id, kind: "report", payload: { items, model } } });
  return requests.length;
}

/** Collects finished batches: saves each report and logs the run at batch price. */
export async function collectReportBatches() {
  const jobs = await prisma.aiBatchJob.findMany({ where: { kind: "report", status: "submitted" } });
  const agent = await prisma.agent.findUnique({ where: { key: "performance_agent" }, select: { id: true } });
  let saved = 0;
  for (const job of jobs) {
    const batch = await anthropic.messages.batches.retrieve(job.batchId);
    if (batch.processing_status !== "ended") continue;
    const { items, model } = job.payload as { items: Item[]; model: string };
    const byId = new Map(items.map((i) => [idOf(i).replace(/[^a-zA-Z0-9_-]/g, "_"), i]));
    const prices = await aiPrices();
    for await (const r of await anthropic.messages.batches.results(job.batchId)) {
      const item = byId.get(r.custom_id);
      if (!item || r.result.type !== "succeeded") continue;
      const msg = r.result.message;
      const text = msg.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("");
      const parsed = ReportSchema.safeParse((() => { try { return JSON.parse(text); } catch { return null; } })());
      if (!parsed.success) continue;
      const period = periodFor(item.kind, new Date(item.periodStart));
      await saveReport(item.clientId, period, parsed.data.takeaways, item.topAssetIds);
      const u = msg.usage as { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
      if (agent)
        await prisma.agentRun.create({
          data: { agentId: agent.id, clientId: item.clientId, input: { batch: job.batchId }, output: parsed.data as object, status: "SUCCESS", decision: `${period.label}: ${parsed.data.takeaways.length} takeaway(s) · batch`, tokensIn: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), tokensOut: u.output_tokens, model, costUsd: costUsd({ model, tokensIn: u.input_tokens, tokensOut: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, batch: true }, prices) },
        });
      saved++;
    }
    await prisma.aiBatchJob.update({ where: { id: job.id }, data: { status: "done", completedAt: new Date() } });
  }
  return saved;
}
