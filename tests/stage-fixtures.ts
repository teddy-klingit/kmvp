import { prisma } from "@/lib/prisma";
import { PIPELINE_STAGE_ORDER } from "@/lib/labels";
import type { PipelineStageName, ProjectStatus, StageStatus } from "@/generated/prisma";

export type StageKey =
  | "briefing"
  | "estimating"
  | "awaiting_approval"
  | "staffing"
  | "production"
  | "review"
  | "final"
  | "closed";

const day = (n: number) => new Date(Date.now() + n * 86400000);

/**
 * One client with one project per stage. The briefing project mirrors the
 * real "Klarna 10-Slide Sales Deck": a DRAFT whose brief agent is waiting on
 * the client — and its PipelineStage rows deliberately claim PRODUCTION is
 * active, to prove the pages no longer trust those rows.
 */
export async function createStageFixtures() {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const client = await prisma.client.create({
    data: { name: `Stage Co ${stamp}`, slug: `stage-co-${stamp}`, onboardingCompletedAt: new Date() },
  });
  const user = await prisma.user.create({
    data: { name: "Jamie Client", email: `jamie-${stamp}@test.local`, role: "CLIENT", status: "ACTIVE" },
  });
  const clientUser = await prisma.clientUser.create({ data: { userId: user.id, clientId: client.id, permission: "OWNER" } });
  const staffUser = await prisma.user.create({
    data: { name: "Sara Staff", email: `sara-${stamp}@test.local`, role: "INTERNAL", status: "ACTIVE" },
  });
  const staff = await prisma.staffMember.create({ data: { userId: staffUser.id, title: "ART_DIRECTOR" } });

  async function project(name: string, status: ProjectStatus, stages: Partial<Record<PipelineStageName, StageStatus>> = {}) {
    // Work past approval holds one of the client's active slots.
    const holding = ["STAFFING", "IN_PRODUCTION", "QA", "AWAITING_REVIEW", "IN_FEEDBACK", "DELIVERED"].includes(status);
    const p = await prisma.project.create({ data: { clientId: client.id, name, status, type: "PRESENTATION", activatedAt: holding ? new Date() : null } });
    await prisma.pipelineStage.createMany({
      data: PIPELINE_STAGE_ORDER.map((stageName, order) => ({
        projectId: p.id,
        name: stageName,
        order,
        status: stages[stageName] ?? "UPCOMING",
      })),
    });
    return p;
  }

  async function asset(projectId: string, name: string, status: "IN_REVIEW" | "APPROVED" | "CHANGES_REQUESTED" | "DELIVERED") {
    await prisma.asset.create({ data: { projectId, clientId: client.id, name, format: "Slide 16:9", status } });
  }

  async function confirmedTeam(projectId: string, confirmedAt: Date) {
    const team = await prisma.team.create({ data: { projectId, confirmed: true, confirmedAt } });
    await prisma.teamMember.create({ data: { teamId: team.id, staffMemberId: staff.id, roleOnProject: "Art director" } });
  }

  // briefing — DRAFT, the brief still in the Brief studio, stage rows contradicting it.
  const briefing = await project("Stage Deck Briefing", "DRAFT", { BRIEF: "COMPLETED", PRODUCTION: "ACTIVE" });
  await prisma.brief.create({
    data: {
      projectId: briefing.id,
      status: "DRAFT",
      rawIntake: "sales presentation with 10 slides",
      qualityScore: 40,
      sections: [
        { key: "deliverables", value: "", items: ["Deck, about 10 slides"], source: "answer", editedByClient: false },
        { key: "objective", value: "Win a pitch or a deal", source: "answer", editedByClient: true },
      ],
    },
  });

  // estimating — brief accepted, nothing sent yet (an unsent DRAFT estimate exists).
  const estimating = await project("Stage Deck Estimating", "ESTIMATING", { BRIEF: "COMPLETED", ESTIMATE: "ACTIVE" });
  await prisma.brief.create({ data: { projectId: estimating.id, status: "ACCEPTED", rawIntake: "deck", acceptedAt: day(-1) } });
  await prisma.estimate.create({ data: { projectId: estimating.id, status: "DRAFT", totalCredits: 99 } });

  // awaiting_approval — estimate sent, 28 credits.
  const awaiting = await project("Stage Deck Awaiting", "ESTIMATING", { BRIEF: "COMPLETED", ESTIMATE: "ACTIVE" });
  await prisma.brief.create({ data: { projectId: awaiting.id, status: "ACCEPTED", rawIntake: "deck", acceptedAt: day(-2) } });
  const est = await prisma.estimate.create({
    data: { projectId: awaiting.id, status: "SENT", totalCredits: 28, sentAt: day(-1), expiresAt: day(3) },
  });
  await prisma.estimateLineItem.create({
    data: { estimateId: est.id, deliverable: "PPT slide", detail: "10 slides, medium", hours: 20, credits: 28, order: 0 },
  });

  // staffing — estimate approved, team not confirmed yet.
  const staffing = await project("Stage Deck Staffing", "STAFFING", { BRIEF: "COMPLETED", ESTIMATE: "ACTIVE" });
  await prisma.estimate.create({
    data: { projectId: staffing.id, status: "APPROVED", totalCredits: 28, sentAt: day(-4), respondedAt: day(-1) },
  });

  // production — team confirmed; assets exist but are only in internal QA.
  const production = await project("Stage Deck Production", "IN_PRODUCTION", { PRODUCTION: "ACTIVE" });
  await confirmedTeam(production.id, day(0));
  await asset(production.id, "Internal draft slide", "IN_REVIEW");

  // review — delivered, two assets awaiting the client.
  const review = await project("Stage Deck Review", "AWAITING_REVIEW", { FEEDBACK: "ACTIVE" });
  await confirmedTeam(review.id, day(-6));
  await asset(review.id, "Slide 1", "IN_REVIEW");
  await asset(review.id, "Slide 2", "IN_REVIEW");

  // final — every asset approved, sign-off pending.
  const final = await project("Stage Deck Final", "IN_FEEDBACK", { FINAL_DELIVERY: "ACTIVE" });
  await confirmedTeam(final.id, day(-9));
  await asset(final.id, "Final slide", "APPROVED");

  // Not a stage of its own: an approval the client let lapse — must land in Urgent only.
  const overdueApproval = await project("Stage Deck Overdue Approval", "ESTIMATING");
  await prisma.estimate.create({
    data: { projectId: overdueApproval.id, status: "SENT", totalCredits: 12, sentAt: day(-6), expiresAt: day(-1) },
  });

  // closed — signed off.
  const closed = await project("Stage Deck Closed", "DELIVERED");
  await prisma.project.update({ where: { id: closed.id }, data: { deliveredAt: day(-1) } });

  const projects: Record<StageKey, { id: string; name: string }> = {
    briefing,
    estimating,
    awaiting_approval: awaiting,
    staffing,
    production,
    review,
    final,
    closed,
  };

  async function cleanup() {
    await prisma.client.delete({ where: { id: client.id } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, staffUser.id] } } });
  }

  return { client, user, clientUser, projects, overdueApproval, cleanup };
}
