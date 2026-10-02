"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { jsonArray } from "@/lib/utils";
import { domainForBrand } from "@/lib/brand-domains";
import { auditSiteOnPage } from "@/lib/integrations/site-audit";
import { getPageSpeedScores } from "@/lib/integrations/pagespeed";
import { askVisibilityQuestion, generateVisibilityQuestions, synthesizeSeoInsights } from "@/lib/ai/agents/seo-agent";
import { askPerplexity } from "@/lib/integrations/perplexity";

export type GenerateSeoReportState = { error?: string | null };

async function auditSubject(clientId: string, subject: string, domain: string) {
  const [onPageResult, pageSpeedResult] = await Promise.all([auditSiteOnPage(domain), getPageSpeedScores(domain)]);

  await prisma.siteAudit.upsert({
    where: { clientId_subject: { clientId, subject } },
    update: {
      domain,
      performanceScore: pageSpeedResult.ok ? pageSpeedResult.scores.performanceScore : null,
      seoScore: pageSpeedResult.ok ? pageSpeedResult.scores.seoScore : null,
      accessibilityScore: pageSpeedResult.ok ? pageSpeedResult.scores.accessibilityScore : null,
      bestPracticesScore: pageSpeedResult.ok ? pageSpeedResult.scores.bestPracticesScore : null,
      onPageChecks: onPageResult.ok ? onPageResult.onPage : {},
      fetchError: onPageResult.ok ? null : onPageResult.message,
      auditedAt: new Date(),
    },
    create: {
      clientId,
      subject,
      domain,
      performanceScore: pageSpeedResult.ok ? pageSpeedResult.scores.performanceScore : null,
      seoScore: pageSpeedResult.ok ? pageSpeedResult.scores.seoScore : null,
      accessibilityScore: pageSpeedResult.ok ? pageSpeedResult.scores.accessibilityScore : null,
      bestPracticesScore: pageSpeedResult.ok ? pageSpeedResult.scores.bestPracticesScore : null,
      onPageChecks: onPageResult.ok ? onPageResult.onPage : {},
      fetchError: onPageResult.ok ? null : onPageResult.message,
    },
  });

  return { subject, domain, onPageResult, pageSpeedResult };
}

export async function generateSeoReportAction(
  _prev: GenerateSeoReportState,
  _formData: FormData
): Promise<GenerateSeoReportState> {
  const viewer = await getPortalViewer();
  const client = viewer.client;

  if (!client.website) {
    return { error: "Add your website in Account settings first." };
  }

  const competitorBrands = jsonArray<string>(client.competitorBrands);
  const competitorTargets = competitorBrands
    .map((brand) => ({ brand, domain: domainForBrand(brand) }))
    .filter((c): c is { brand: string; domain: string } => Boolean(c.domain));

  const [ownAudit, ...competitorAudits] = await Promise.all([
    auditSubject(client.id, "Own site", client.website),
    ...competitorTargets.map((c) => auditSubject(client.id, c.brand, c.domain)),
  ]);

  const questionsResult = await generateVisibilityQuestions({
    clientId: client.id,
    industry: client.industry,
    competitorBrands,
  });

  const visibilityChecks: { question: string; engine: string; answer: string; mentions: { brand: string; mentioned: boolean }[] }[] = [];
  if (questionsResult.ok) {
    const brandsToCheck = [client.name, ...competitorBrands];
    const mentionsFor = (answer: string) => {
      const lower = answer.toLowerCase();
      return brandsToCheck.map((brand) => ({ brand, mentioned: lower.includes(brand.toLowerCase()) }));
    };

    // Run every question against every engine concurrently — sequential grounded
    // calls (Claude web search + Perplexity, per question) pushed this well past a
    // minute and tripped the platform's request timeout even though the work
    // itself succeeded. Bounded by the single slowest call instead of their sum.
    const checkResults = await Promise.all(
      questionsResult.data.questions.flatMap((question) => [
        askVisibilityQuestion({ clientId: client.id, question }).then((r) =>
          r.ok ? { question, engine: "claude", answer: r.data.answer } : null
        ),
        askPerplexity(question).then((r) => (r.ok ? { question, engine: "perplexity", answer: r.answer } : null)),
      ])
    );

    for (const check of checkResults) {
      if (!check) continue;
      const mentions = mentionsFor(check.answer);
      visibilityChecks.push({ ...check, mentions });
      await prisma.aiVisibilityCheck.create({
        data: { clientId: client.id, engine: check.engine, grounded: true, question: check.question, answer: check.answer, mentions },
      });
    }
  }

  const result = await synthesizeSeoInsights({
    clientId: client.id,
    clientName: client.name,
    ownSite: ownAudit.onPageResult.ok
      ? { domain: ownAudit.domain, onPage: ownAudit.onPageResult.onPage, scores: ownAudit.pageSpeedResult.ok ? ownAudit.pageSpeedResult.scores : null }
      : { domain: ownAudit.domain, error: ownAudit.onPageResult.message },
    competitorSites: competitorAudits.map((a) =>
      a.onPageResult.ok
        ? { brand: a.subject, domain: a.domain, onPage: a.onPageResult.onPage, scores: a.pageSpeedResult.ok ? a.pageSpeedResult.scores : null }
        : { brand: a.subject, domain: a.domain, error: a.onPageResult.message }
    ),
    visibilityChecks,
  });

  if (!result.ok) return { error: result.error };

  await prisma.seoBrief.upsert({
    where: { clientId: client.id },
    update: { summary: result.data.summary, recommendations: result.data.recommendations, generatedAt: new Date() },
    create: { clientId: client.id, summary: result.data.summary, recommendations: result.data.recommendations },
  });

  revalidatePath("/insights/seo");
  revalidatePath("/insights");
  return { error: null };
}
