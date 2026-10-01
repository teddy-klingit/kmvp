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
      { projectId: investor.id, kind: "SYSTEM", body: "Estimate v1 sent", createdAt: ago(5) },
      { projectId: investor.id, authorUserId: teddy.userId, body: "Hi Jack, here's the estimate for the Q4 deck. Two of the slides need custom charts, so they're priced as High.", createdAt: ago(4.9) },
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

  console.log("Stage demo projects:", { briefing: deck.id, awaiting_approval: investor.id, production: q3.id, final: holiday.id });
}

main().finally(() => prisma.$disconnect());
