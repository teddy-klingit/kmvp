/**
 * Adds one Klarna demo project per client-facing stage the base seed doesn't
 * already cover, for screenshot runs. Local screenshot DB only:
 *
 *   DATABASE_URL="file:./prisma/screens.db" npx tsx scripts/screenshots/seed-stages.ts
 */
import { PrismaClient } from "../../src/generated/prisma";
import { PIPELINE_STAGE_ORDER } from "../../src/lib/labels";

if (!process.env.DATABASE_URL?.includes("screens.db")) {
  throw new Error("Refusing to run: point DATABASE_URL at the local screens.db screenshot database.");
}

const prisma = new PrismaClient();
const day = (n: number) => new Date(Date.now() + n * 86400000);

async function stages(projectId: string, activeIndex: number) {
  await prisma.pipelineStage.createMany({
    data: PIPELINE_STAGE_ORDER.map((name, order) => ({
      projectId,
      name,
      order,
      status: order < activeIndex ? "COMPLETED" : order === activeIndex ? "ACTIVE" : "UPCOMING",
      completedAt: order < activeIndex ? day(-10 + order) : null,
    })),
  });
}

async function main() {
  const klarna = await prisma.client.findUniqueOrThrow({ where: { slug: "klarna" } });
  const jack = await prisma.clientUser.findFirstOrThrow({ where: { clientId: klarna.id, user: { email: "jack.ross@klarna.com" } } });
  const teddy = await prisma.staffMember.findFirstOrThrow({ where: { user: { email: "teddy@klingit.com" } } });
  const sara = await prisma.staffMember.findFirstOrThrow({ where: { user: { email: "sara.n@klingit.com" } } });
  const marcus = await prisma.staffMember.findFirstOrThrow({ where: { user: { email: "marcus@klingit.com" } } });

  // briefing — the brief agent is waiting on the client.
  const deck = await prisma.project.create({
    data: { clientId: klarna.id, name: "Klarna 10-Slide Sales Deck", type: "PRESENTATION", status: "DRAFT", createdByClientUserId: jack.id },
  });
  await stages(deck.id, 0);
  await prisma.brief.create({
    data: {
      projectId: deck.id,
      submittedByUserId: jack.id,
      status: "DRAFT",
      rawIntake: "We need a 10-slide sales deck for merchant partners.",
      goals: "We need a 10-slide sales deck for merchant partners.",
      aiSummary: "A 10-slide sales deck pitching Klarna to prospective merchant partners.",
      pendingQuestions: [
        { key: "audience", question: "Who will you present this deck to — new merchants, or existing partners you're upselling?", quickAnswers: ["New merchants", "Existing partners", "Both"] },
        { key: "deadline", question: "When do you need the final deck?", quickAnswers: ["This week", "Next week", "End of month"] },
      ],
      transcript: [{ key: "deadline", question: "When do you need the final deck?", answer: "Next week" }],
      submittedAt: day(0),
    },
  });

  // awaiting_approval — a 28-credit estimate built from the price list.
  const investor = await prisma.project.create({
    data: { clientId: klarna.id, name: "Klarna Q4 Investor Update Deck", type: "PRESENTATION", status: "ESTIMATING", createdByClientUserId: jack.id, dueDate: day(12) },
  });
  await stages(investor.id, 1);
  await prisma.brief.create({
    data: {
      projectId: investor.id,
      submittedByUserId: jack.id,
      status: "ACCEPTED",
      goals: "A 12-slide Q4 investor update in the Klarna template.",
      targetAudience: "Board members and lead investors.",
      successMetrics: "Board-ready by the Q4 meeting.",
      acceptedAt: day(-1),
      submittedAt: day(-2),
    },
  });
  const est = await prisma.estimate.create({
    data: {
      projectId: investor.id,
      sentByStaffId: teddy.id,
      status: "SENT",
      totalCredits: 28,
      totalHours: 28,
      sentAt: day(0),
      expiresAt: day(4),
      notes: "Scoped from your brief using the Klingit price list. Happy to adjust before you approve.",
      inclusions: ["Applied to your existing Klarna deck template", "2 rounds of revisions", "Editable .pptx plus PDF"],
    },
  });
  const price = (deliverableType: string, complexityTier: "LOW" | "MEDIUM" | "HIGH") =>
    prisma.priceListItem.findUniqueOrThrow({ where: { deliverableType_complexityTier: { deliverableType, complexityTier } } });
  const [slideMed, slideHigh, postMed, cutLow] = await Promise.all([
    price("PPT slide", "MEDIUM"),
    price("PPT slide", "HIGH"),
    price("Social post (static)", "MEDIUM"),
    price("Video cutdown (<30s)", "LOW"),
  ]);
  await prisma.estimateLineItem.createMany({
    data: [
      { estimateId: est.id, deliverable: "PPT slide", detail: "10 slides · text on your existing template", quantity: 10, complexityTier: "MEDIUM", priceListItemId: slideMed.id, hours: 20, credits: 20, order: 0 },
      { estimateId: est.id, deliverable: "PPT slide", detail: "2 slides · custom charts", quantity: 2, complexityTier: "HIGH", priceListItemId: slideHigh.id, hours: 8, credits: 8, order: 1 },
    ],
  });

  // production — the seeded Q3 campaign: give its team a confirmation time so the first-draft ETA shows.
  const q3 = await prisma.project.findFirstOrThrow({ where: { clientId: klarna.id, name: "Q3 App install campaign" } });
  await prisma.team.update({ where: { projectId: q3.id }, data: { confirmedAt: day(-1) } });

  // final — everything approved, sign-off pending.
  const holiday = await prisma.project.create({
    data: { clientId: klarna.id, name: "Klarna Holiday Social Pack", type: "CAMPAIGN", status: "IN_FEEDBACK", createdByClientUserId: jack.id, startedAt: day(-14), dueDate: day(1) },
  });
  await stages(holiday.id, 7);
  await prisma.brief.create({
    data: { projectId: holiday.id, submittedByUserId: jack.id, status: "ACCEPTED", goals: "Holiday shopping social pack.", targetAudience: "Existing Klarna app users.", acceptedAt: day(-14) },
  });
  const holidayEst = await prisma.estimate.create({
    data: { projectId: holiday.id, sentByStaffId: teddy.id, status: "APPROVED", approvedVersion: 1, totalCredits: 21, sentAt: day(-13), respondedAt: day(-13) },
  });
  await prisma.estimateLineItem.createMany({
    data: [
      { estimateId: holidayEst.id, deliverable: "Social post (static)", detail: "4 posts", quantity: 4, complexityTier: "MEDIUM", priceListItemId: postMed.id, hours: 16, credits: 16, order: 0 },
      { estimateId: holidayEst.id, deliverable: "Video cutdown (<30s)", detail: "1 cutdown", quantity: 1, complexityTier: "LOW", priceListItemId: cutLow.id, hours: 5, credits: 5, order: 1 },
    ],
  });
  const holidayTeam = await prisma.team.create({ data: { projectId: holiday.id, proposedByStaffId: teddy.id, confirmed: true, confirmedAt: day(-12) } });
  await prisma.teamMember.createMany({
    data: [
      { teamId: holidayTeam.id, staffMemberId: sara.id, roleOnProject: "Art director", allocatedHours: 10 },
      { teamId: holidayTeam.id, staffMemberId: marcus.id, roleOnProject: "Copywriter", allocatedHours: 6 },
    ],
  });
  const colors = ["var(--avatar-1)", "var(--avatar-3)", "var(--avatar-5)", "var(--avatar-6)", "var(--avatar-2)"];
  const holidayAssets: [string, string, "IMAGE" | "VIDEO"][] = [
    ["Gift guide", "Story 9:16", "IMAGE"],
    ["Last-minute deals", "Static 1:1", "IMAGE"],
    ["Wishlist", "Carousel · 4 slides", "IMAGE"],
    ["Holiday hero", "Static 1:1", "IMAGE"],
    ["Countdown", "Video 9:16", "VIDEO"],
  ];
  for (const [i, [name, format, type]] of holidayAssets.entries()) {
    await prisma.asset.create({
      data: { projectId: holiday.id, clientId: klarna.id, name, format, type, status: "APPROVED", thumbnailColor: colors[i] },
    });
  }

  // review — a little conversation on both channels for the sidebar / chat sheet.
  const summer = await prisma.project.findFirstOrThrow({ where: { clientId: klarna.id, name: "Summer social pack" } });
  const elin = await prisma.clientUser.findFirstOrThrow({ where: { clientId: klarna.id, user: { email: "elin.svensson@klarna.com" } } });
  await prisma.comment.create({
    data: {
      projectId: summer.id,
      authorUserId: sara.userId,
      body: "First round is up — 3 assets are ready for your review. Shout if anything feels off-brand.",
      createdAt: new Date(Date.now() - 3 * 3600000),
    },
  });
  await prisma.clientInternalMessage.create({
    data: {
      projectId: summer.id,
      clientId: klarna.id,
      authorClientUserId: elin.id,
      body: "Asset 3 still feels too corporate to me — can you push back on it before we approve?",
      createdAt: new Date(Date.now() - 3600000),
    },
  });

  // System events + a context-tagged message, so the conversation panel shows its chips.
  const ago = (h: number) => new Date(Date.now() - h * 3600000);
  await prisma.comment.createMany({
    data: [
      { projectId: investor.id, kind: "SYSTEM", body: "Estimate v1 sent", createdAt: ago(53) },
      { projectId: investor.id, authorUserId: teddy.userId, body: "Hi Jack, here's the estimate for the Q4 deck. Two of the slides need custom charts, so they're priced as High.", createdAt: ago(52.9) },
      { projectId: summer.id, kind: "SYSTEM", body: "Your team is confirmed: Sara, Marcus · first draft by Fri", createdAt: ago(80) },
      { projectId: summer.id, kind: "SYSTEM", body: "First draft delivered", createdAt: ago(3.1) },
    ],
  });
  const summerAsset = await prisma.asset.findFirst({ where: { projectId: summer.id }, orderBy: { createdAt: "asc" } });
  if (summerAsset) {
    await prisma.comment.create({
      data: {
        projectId: summer.id,
        authorClientUserId: jack.id,
        body: "Can the headline be a touch bigger on this one?",
        contextKind: "asset",
        contextRef: summerAsset.id,
        contextLabel: `On ${summerAsset.name}`,
        createdAt: ago(1.5),
      },
    });
  }

  // ── Phase I (PM cockpit) demo states ──────────────────────────────────────
  const agentId = async (key: string) => (await prisma.agent.findUniqueOrThrow({ where: { key } })).id;
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600000);

  // Investor deck: the agent priced it, Jack asked a question two days ago (> 4 working hours), Sara left a note.
  await prisma.estimateRevision.create({
    data: {
      estimateId: est.id,
      version: 1,
      totalCredits: 28,
      status: "SENT",
      createdByUserId: teddy.userId,
      lineItems: [
        { deliverable: "Presentation slides", detail: "10 slides · text on your existing template", quantity: 10, complexityTier: "MEDIUM", credits: 20, priceListItemId: slideMed.id },
        { deliverable: "Data visualisation slides", detail: "2 slides · custom charts", quantity: 2, complexityTier: "HIGH", credits: 8, priceListItemId: slideHigh.id },
      ],
    },
  });
  await prisma.agentRun.createMany({
    data: [
      { agentId: await agentId("brief_agent"), projectId: investor.id, clientId: klarna.id, status: "SUCCESS", decision: "Brief complete: 0 gaps. Audience taken from Brand OS personas.", createdAt: hoursAgo(50) },
      { agentId: await agentId("estimate_agent"), projectId: investor.id, clientId: klarna.id, status: "SUCCESS", decision: "Priced 2 line items from the price list", output: { notes: "Two chart slides need custom data visualisation, so they're High." }, createdAt: hoursAgo(5.2) },
    ],
  });
  await prisma.comment.create({
    data: { projectId: investor.id, authorClientUserId: jack.id, body: "Can we reuse the Q3 charts instead of custom ones? Would like to keep cost down.", createdAt: hoursAgo(49) },
  });
  await prisma.projectStaffNote.create({
    data: { projectId: investor.id, authorUserId: sara.userId, body: "The Q3 charts are in the brand library and on-template. Reusing them is fine with me.", createdAt: hoursAgo(30) },
  });

  // Staffing: approved, waiting for a team. A campaign needs a motion designer.
  const checkout = await prisma.project.create({
    data: { clientId: klarna.id, name: "Checkout-Moment Story Ads", type: "CAMPAIGN", status: "STAFFING", createdByClientUserId: jack.id, dueDate: day(16) },
  });
  await stages(checkout.id, 3);
  await prisma.brief.create({ data: { projectId: checkout.id, submittedByUserId: jack.id, status: "ACCEPTED", goals: "Story ads for the moment of checkout.", targetAudience: "Klarna app users aged 20–35.", acceptedAt: day(-4) } });
  const checkoutEst = await prisma.estimate.create({
    data: { projectId: checkout.id, sentByStaffId: teddy.id, status: "APPROVED", approvedVersion: 1, totalCredits: 33, sentAt: day(-3), respondedAt: day(-1) },
  });
  const cutMed = await price("Video cutdown (<30s)", "MEDIUM");
  await prisma.estimateLineItem.createMany({
    data: [
      { estimateId: checkoutEst.id, deliverable: "Video cutdown (<30s)", detail: "3 story cutdowns", quantity: 3, complexityTier: "MEDIUM", priceListItemId: cutMed.id, credits: 27, hours: 27, order: 0 },
      { estimateId: checkoutEst.id, deliverable: "Social post (static)", detail: "Static end frames", quantity: 1, complexityTier: "MEDIUM", priceListItemId: postMed.id, credits: 4, hours: 4, order: 1 },
    ],
  });
  await prisma.estimateLineItem.create({
    data: { estimateId: checkoutEst.id, deliverable: "Email copy", detail: "Launch email", quantity: 1, complexityTier: "LOW", priceListItemId: (await price("Email copy", "LOW")).id, credits: 2, hours: 2, order: 2 },
  });

  // Estimating: the agent couldn't price two items, so the draft waits for a PM.
  const goodBoy = await prisma.project.create({
    data: { clientId: klarna.id, name: "Good Boy “5:47” Awareness Campaign", type: "CAMPAIGN", status: "ESTIMATING", createdByClientUserId: jack.id, dueDate: day(25) },
  });
  await stages(goodBoy.id, 2);
  await prisma.brief.create({ data: { projectId: goodBoy.id, submittedByUserId: jack.id, status: "ACCEPTED", goals: "Awareness push around the 5:47 pm commute.", targetAudience: "Commuters in Stockholm and Berlin.", acceptedAt: day(-1) } });
  const goodBoyEst = await prisma.estimate.create({
    data: {
      projectId: goodBoy.id,
      status: "DRAFT",
      totalCredits: 31,
      unresolvedNeeds: [
        { description: "Ad copywriting (6 variants)", reason: "No copywriting row for paid ads on the price list." },
        { description: "Paid media setup", reason: "Media buying isn't on the price list." },
      ],
    },
  });
  await prisma.estimateLineItem.createMany({
    data: [
      { estimateId: goodBoyEst.id, deliverable: "Social post (static)", detail: "Commute posters, 4 formats", quantity: 4, complexityTier: "MEDIUM", priceListItemId: postMed.id, credits: 16, hours: 16, order: 0 },
      { estimateId: goodBoyEst.id, deliverable: "Video cutdown (<30s)", detail: "15s commute spot", quantity: 1, complexityTier: "HIGH", priceListItemId: (await price("Video cutdown (<30s)", "HIGH")).id, credits: 15, hours: 15, order: 1 },
    ],
  });
  await prisma.agentRun.create({
    data: { agentId: await agentId("estimate_agent"), projectId: goodBoy.id, clientId: klarna.id, status: "SUCCESS", decision: "Priced 2 line items — 2 need manual pricing", createdAt: hoursAgo(1.5) },
  });

  // Production: a revised estimate (v2) after the client approved v1 — the client sees the changes.
  const q3Estimate = await prisma.estimate.findUniqueOrThrow({ where: { projectId: q3.id }, include: { lineItems: { orderBy: { order: "asc" } } } });
  const snap = (lines: typeof q3Estimate.lineItems) => lines.map((l) => ({ deliverable: l.deliverable, detail: l.detail, quantity: l.quantity, complexityTier: l.complexityTier, credits: l.credits, isCustom: l.isCustom, customReason: l.customReason, priceListItemId: l.priceListItemId }));
  await prisma.estimateRevision.create({ data: { estimateId: q3Estimate.id, version: 1, totalCredits: q3Estimate.totalCredits, status: "APPROVED", lineItems: snap(q3Estimate.lineItems), respondedAt: day(-4) } });
  const banners = q3Estimate.lineItems.find((l) => l.deliverable === "Display banners");
  if (banners) {
    await prisma.estimateLineItem.update({ where: { id: banners.id }, data: { quantity: 6, credits: 15, hours: 15, detail: "6 sizes · HTML5 + static fallback" } });
    const v2Lines = await prisma.estimateLineItem.findMany({ where: { estimateId: q3Estimate.id }, orderBy: { order: "asc" } });
    const total = v2Lines.reduce((n, l) => n + l.credits, 0);
    const reason = "Two extra banner sizes for the app store placements you asked for.";
    await prisma.estimate.update({ where: { id: q3Estimate.id }, data: { status: "SENT", version: 2, approvedVersion: 1, totalCredits: total, revisionReason: reason, sentAt: hoursAgo(3), expiresAt: day(4) } });
    await prisma.estimateRevision.create({ data: { estimateId: q3Estimate.id, version: 2, totalCredits: total, status: "SENT", reason, createdByUserId: teddy.userId, lineItems: snap(v2Lines) } });
    await prisma.decisionLog.create({
      data: { projectId: q3.id, actorUserId: teddy.userId, area: "estimate", action: "Sent estimate v2", reason, before: { total: q3Estimate.totalCredits }, after: { total }, createdAt: hoursAgo(3) },
    });
    await prisma.comment.create({ data: { projectId: q3.id, kind: "SYSTEM", body: `Estimate v2 sent: ${reason}`, createdAt: hoursAgo(3) } });
  }

  // This week in the market: live Insights pages create these from the ad platforms; seed a typical week.
  await prisma.marketSignal.createMany({
    data: [
      { clientId: klarna.id, type: "PERFORMANCE", dedupeKey: "perf:LinkedIn:aw-1", title: '"Pay later awareness · SE" CTR down 44% vs its trailing average', summary: "LinkedIn: 0.82% → 0.46% CTR.", source: "LinkedIn", relevance: "Relevant", publishedAt: hoursAgo(30) },
      { clientId: klarna.id, type: "PERFORMANCE", dedupeKey: "perf:LinkedIn:aw-2", title: '"Pay later awareness · NO" CTR down 61% vs its trailing average', summary: "LinkedIn: 0.74% → 0.29% CTR.", source: "LinkedIn", relevance: "High relevance", publishedAt: hoursAgo(54) },
      { clientId: klarna.id, type: "PERFORMANCE", dedupeKey: "perf:LinkedIn:aw-3", title: '"Checkout video · DK" CTR down 100% vs its trailing average', summary: "LinkedIn: 0.51% → 0% CTR.", source: "LinkedIn", relevance: "High relevance", publishedAt: hoursAgo(76) },
      { clientId: klarna.id, type: "COMPETITOR", dedupeKey: "competitor:zip", title: "Zip launched 3 new ads on LinkedIn", summary: "Spotted in the LinkedIn Ad Library since the last check.", source: "LinkedIn", relevance: "High relevance", publishedAt: hoursAgo(28) },
      { clientId: klarna.id, type: "COMPETITOR", dedupeKey: "competitor:afterpay", title: "Afterpay launched 3 new ads on LinkedIn", summary: "Spotted in the LinkedIn Ad Library since the last check.", source: "LinkedIn", relevance: "High relevance", publishedAt: hoursAgo(28) },
      { clientId: klarna.id, type: "TREND", title: "Marketers are planning for a consumer that no longer exists", summary: "Industry news.", source: "News", relevance: "Watch", publishedAt: hoursAgo(20) },
    ],
  });

  // Brand OS linked sources: Drive + Figma connected as demos, real links on "Our Brand".
  for (const app of ["google_drive", "figma"]) {
    await prisma.brandConnection.create({ data: { clientId: klarna.id, app, status: "CONNECTED", connectedAt: hoursAgo(26), isDemo: true } });
  }
  await prisma.brandSource.createMany({
    data: [
      { clientId: klarna.id, app: "google_drive", url: "https://drive.google.com/", title: "Brand guidelines 2026.pdf", section: "our-brand", isDemo: true, createdByUserId: jack.userId },
      { clientId: klarna.id, app: "notion", url: "https://www.notion.so/klarna/Tone-of-voice", title: "Tone of voice", section: "our-brand", isDemo: false, createdByUserId: jack.userId },
      { clientId: klarna.id, app: "web", url: "https://www.klarna.com/international/about-us/", title: "klarna.com · About us", section: "our-brand", isDemo: false, createdByUserId: jack.userId },
      { clientId: klarna.id, app: "figma", url: "https://www.figma.com/", title: "Klarna Design System", section: "figma-design-system", isDemo: true, createdByUserId: jack.userId },
      { clientId: klarna.id, app: "google_drive", url: "https://drive.google.com/", title: "Campaign assets", isDemo: true, createdByUserId: jack.userId },
      { clientId: klarna.id, app: "figma", url: "https://www.figma.com/", title: "Logo suite", section: "visual-identity", isDemo: true, createdByUserId: jack.userId },
    ],
  });

  console.log("Stage demo projects:", { briefing: deck.id, awaiting_approval: investor.id, production: q3.id, final: holiday.id });
}

main().finally(() => prisma.$disconnect());
