import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { saveEstimateAction, staffReplyAction, staffNoteAction, setAutopilotAction, updateDatesAction, swapTeamMemberAction, updateTeamMemberAction } from "@/lib/actions/cockpit-actions";
import { approveEstimateAction, requestEstimateChangesAction } from "@/lib/actions/project-actions";
import { listStaffNotes } from "@/lib/staff-notes";
import { loadProjectConversation } from "@/lib/project-conversation";
import { getPortalViewer } from "@/lib/current-viewer";
import { planAutopilot, AUTO_SEND_CREDIT_CAP, AUTO_STAFF_THRESHOLD, type AutopilotInput } from "@/lib/autopilot";
import { runAutopilot } from "@/lib/autopilot-runner";
import { workingHoursBetween } from "@/lib/working-hours";
import { loadOpsProjects } from "@/lib/ops-exceptions";
import { resolveLegacyDelivery } from "@/lib/ops-routes";
import { runAgentTask } from "@/lib/ai/run-agent";
import { z } from "zod";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
let pmUserId: string;
const extraUsers: string[] = [];

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const pm = await prisma.user.create({ data: { name: "Petra Manager", email: `pm-${stamp}@test.local`, role: "INTERNAL", status: "ACTIVE" } });
  pmUserId = pm.id;
  extraUsers.push(pm.id);
  await prisma.staffMember.create({ data: { userId: pm.id, title: "PROJECT_MANAGER" } });
  for (const key of ["estimate_agent", "brief_agent", "staffing_agent"]) {
    await prisma.agent.upsert({ where: { key }, update: {}, create: { key, name: key.replace("_", " "), category: "ESTIMATE", description: "test" } });
  }
  await prisma.priceListItem.upsert({
    where: { deliverableType_complexityTier: { deliverableType: "PPT slide", complexityTier: "MEDIUM" } },
    update: { creditCost: 2, displayName: "Presentation slides" },
    create: { deliverableType: "PPT slide", complexityTier: "MEDIUM", creditCost: 2, displayName: "Presentation slides" },
  });
  await prisma.priceListItem.upsert({
    where: { deliverableType_complexityTier: { deliverableType: "PPT slide", complexityTier: "HIGH" } },
    update: { creditCost: 4 },
    create: { deliverableType: "PPT slide", complexityTier: "HIGH", creditCost: 4, displayName: "Data visualisation slides" },
  });
});

afterAll(async () => {
  await fx.cleanup();
  await prisma.user.deleteMany({ where: { id: { in: extraUsers } } });
});

const asPM = () => setMockSession({ user: { id: pmUserId, role: "INTERNAL" } });
const asCreator = () => setMockSession({ user: { id: fx.creatorUser.id, role: "INTERNAL" } });
const asClient = () => setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

/** A deck project with a SENT v1 estimate (10 slides Medium + 2 High = 28) and an estimate-agent run. */
async function sentEstimateProject(status: "ESTIMATING" | "IN_PRODUCTION" = "ESTIMATING", approved = false) {
  const project = await prisma.project.create({ data: { clientId: fx.clientA.id, name: `Deck ${Math.random()}`, type: "PRESENTATION", status } });
  const [med, high] = await Promise.all([
    prisma.priceListItem.findUniqueOrThrow({ where: { deliverableType_complexityTier: { deliverableType: "PPT slide", complexityTier: "MEDIUM" } } }),
    prisma.priceListItem.findUniqueOrThrow({ where: { deliverableType_complexityTier: { deliverableType: "PPT slide", complexityTier: "HIGH" } } }),
  ]);
  const estimate = await prisma.estimate.create({
    data: { projectId: project.id, status: approved ? "APPROVED" : "SENT", totalCredits: 28, sentAt: new Date(), version: 1, approvedVersion: approved ? 1 : null },
  });
  const lines = [
    { deliverable: "PPT slide", detail: "10 slides", quantity: 10, complexityTier: "MEDIUM" as const, priceListItemId: med.id, credits: 20, hours: 20, order: 0 },
    { deliverable: "PPT slide", detail: "2 chart slides", quantity: 2, complexityTier: "HIGH" as const, priceListItemId: high.id, credits: 8, hours: 8, order: 1 },
  ];
  await prisma.estimateLineItem.createMany({ data: lines.map((l) => ({ ...l, estimateId: estimate.id })) });
  await prisma.estimateRevision.create({
    data: {
      estimateId: estimate.id,
      version: 1,
      totalCredits: 28,
      status: approved ? "APPROVED" : "SENT",
      lineItems: [
        { deliverable: "Presentation slides", detail: "10 slides", quantity: 10, complexityTier: "MEDIUM", credits: 20, priceListItemId: med.id },
        { deliverable: "Data visualisation slides", detail: "2 chart slides", quantity: 2, complexityTier: "HIGH", credits: 8, priceListItemId: high.id },
      ],
    },
  });
  const agent = await prisma.agent.findUniqueOrThrow({ where: { key: "estimate_agent" } });
  const run = await prisma.agentRun.create({ data: { agentId: agent.id, projectId: project.id, decision: "Priced 2 lines", status: "SUCCESS" } });
  return { project, estimate, run };
}

const editedLines = JSON.stringify([
  { kind: "price", deliverableType: "PPT slide", complexityTier: "MEDIUM", quantity: 10, detail: "10 slides" },
  { kind: "price", deliverableType: "PPT slide", complexityTier: "MEDIUM", quantity: 2, detail: "Reuse the Q3 charts" },
]);

describe("I4 permissions", () => {
  it("a Creator can't edit an estimate", async () => {
    const { project, estimate } = await sentEstimateProject();
    asCreator();
    await expect(saveEstimateAction({}, form({ projectId: project.id, lines: editedLines, reason: "Cheaper" }))).rejects.toThrow(/permission/);
    const after = await prisma.estimate.findUniqueOrThrow({ where: { id: estimate.id } });
    expect(after.version).toBe(1);
    expect(after.totalCredits).toBe(28);
  });

  it("a Creator can't change dates, staffing or autopilot, but can write staff notes", async () => {
    const { project } = await sentEstimateProject();
    asCreator();
    await expect(updateDatesAction({}, form({ projectId: project.id, dueDate: "2026-12-01", reason: "x" }))).rejects.toThrow(/permission/);
    await expect(setAutopilotAction(form({ projectId: project.id, on: "0" }))).rejects.toThrow(/permission/);
    await expect(swapTeamMemberAction(form({ projectId: project.id, teamMemberId: "x", staffMemberId: "y" }))).rejects.toThrow(/permission/);
    await staffNoteAction(form({ projectId: project.id, body: "Creator note" }));
    expect(await prisma.projectStaffNote.count({ where: { projectId: project.id } })).toBe(1);
  });

  it("a client can't call a staff action", async () => {
    const { project } = await sentEstimateProject();
    asClient();
    await expect(staffReplyAction(form({ projectId: project.id, body: "hi" }))).rejects.toThrow(/REDIRECT/);
  });
});

describe("PM override changes the data and is logged", () => {
  it("editing an estimate the client already has creates v2, recomputes credits on the server, overrides the agent run and tells the client", async () => {
    const { project, estimate, run } = await sentEstimateProject();
    asPM();
    const result = await saveEstimateAction({}, form({ projectId: project.id, lines: editedLines, reason: "Reusing your Q3 charts" }));
    expect(result.error).toBeUndefined();

    const after = await prisma.estimate.findUniqueOrThrow({ where: { id: estimate.id }, include: { lineItems: { orderBy: { order: "asc" } } } });
    expect(after.version).toBe(2);
    expect(after.status).toBe("SENT");
    expect(after.totalCredits).toBe(24); // 10×2 + 2×2, never a number from the form
    expect(after.revisionReason).toBe("Reusing your Q3 charts");
    expect(after.lineItems.map((l) => l.credits)).toEqual([20, 4]);

    const log = await prisma.decisionLog.findFirstOrThrow({ where: { projectId: project.id, area: "estimate" } });
    expect(log.actorUserId).toBe(pmUserId);
    expect(log.reason).toBe("Reusing your Q3 charts");
    expect((log.before as { total: number }).total).toBe(28);
    expect((log.after as { total: number }).total).toBe(24);
    expect(log.agentRunId).toBe(run.id);
    const overridden = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(overridden.overridden).toBe(true);
    expect(overridden.overriddenByUserId).toBe(pmUserId);

    expect(await prisma.estimateRevision.findMany({ where: { estimateId: estimate.id }, orderBy: { version: "asc" }, select: { version: true, status: true } })).toEqual([
      { version: 1, status: "SUPERSEDED" },
      { version: 2, status: "SENT" },
    ]);
    expect(await prisma.comment.findFirst({ where: { projectId: project.id, kind: "SYSTEM", body: { startsWith: "Estimate v2 sent" } } })).not.toBeNull();
  });

  it("a revision needs a reason for the client", async () => {
    const { project } = await sentEstimateProject();
    asPM();
    const result = await saveEstimateAction({}, form({ projectId: project.id, lines: editedLines, reason: "" }));
    expect(result.error).toMatch(/reason/i);
  });

  it("a declined revision restores the last approved version, and the stage never moves back", async () => {
    const { project, estimate } = await sentEstimateProject("IN_PRODUCTION", true);
    asPM();
    await saveEstimateAction({}, form({ projectId: project.id, lines: editedLines, reason: "Cheaper charts" }));
    asClient();
    await requestEstimateChangesAction(form({ estimateId: estimate.id }));
    const after = await prisma.estimate.findUniqueOrThrow({ where: { id: estimate.id }, include: { lineItems: true } });
    expect(after.status).toBe("APPROVED");
    expect(after.totalCredits).toBe(28);
    expect(after.lineItems.reduce((n, l) => n + l.credits, 0)).toBe(28);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).status).toBe("IN_PRODUCTION");
    expect(await prisma.comment.findFirst({ where: { projectId: project.id, body: { contains: "v1 stays in force" } } })).not.toBeNull();
  });

  it("an approved revision keeps the project where it is", async () => {
    const { project, estimate } = await sentEstimateProject("IN_PRODUCTION", true);
    asPM();
    await saveEstimateAction({}, form({ projectId: project.id, lines: editedLines, reason: "Cheaper charts" }));
    asClient();
    await approveEstimateAction(form({ estimateId: estimate.id }));
    const after = await prisma.estimate.findUniqueOrThrow({ where: { id: estimate.id } });
    expect(after.status).toBe("APPROVED");
    expect(after.approvedVersion).toBe(2);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).status).toBe("IN_PRODUCTION");
  });

  it("role and hours edits don't restart the first-draft clock", async () => {
    const { project } = await sentEstimateProject("IN_PRODUCTION", true);
    const confirmedAt = new Date(Date.now() - 86400000);
    const team = await prisma.team.create({ data: { projectId: project.id, confirmed: true, confirmedAt } });
    const member = await prisma.teamMember.create({ data: { teamId: team.id, staffMemberId: fx.creatorStaff.id, roleOnProject: "Art director", allocatedHours: 4 } });
    asPM();
    await updateTeamMemberAction(form({ projectId: project.id, teamMemberId: member.id, role: "Lead designer", hours: "6" }));
    const after = await prisma.team.findUniqueOrThrow({ where: { id: team.id } });
    expect(after.confirmedAt?.getTime()).toBe(confirmedAt.getTime());
    expect((await prisma.teamMember.findUniqueOrThrow({ where: { id: member.id } })).roleOnProject).toBe("Lead designer");
  });
});

describe("Staff replies and staff notes", () => {
  it("a staff reply appears to the client under the staff member's name", async () => {
    const { project } = await sentEstimateProject();
    asPM();
    await staffReplyAction(form({ projectId: project.id, body: "Yes, we can reuse the Q3 charts." }));
    asClient();
    const convo = await loadProjectConversation(project.id, await getPortalViewer());
    const reply = convo.klingit.find((m) => m.body === "Yes, we can reuse the Q3 charts.");
    expect(reply?.authorName).toBe("Petra Manager");
    expect(reply?.authorRole).toBe("Project manager");
    expect(reply?.fromKlingit).toBe(true);
    expect(reply?.mine).toBe(false);
  });

  it("staff notes never reach a client: the reader refuses a client session", async () => {
    const { project } = await sentEstimateProject();
    asPM();
    await staffNoteAction(form({ projectId: project.id, body: "Client is price sensitive" }));
    asClient();
    await expect(listStaffNotes(project.id)).rejects.toThrow(/REDIRECT/);
    const convo = await loadProjectConversation(project.id, await getPortalViewer());
    expect(JSON.stringify(convo)).not.toContain("price sensitive");
  });

  it("only src/lib/staff-notes.ts queries the ProjectStaffNote table", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== "generated") walk(path);
        } else if (/\.(ts|tsx)$/.test(name) && readFileSync(path, "utf8").includes("projectStaffNote")) {
          offenders.push(path);
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([join("src", "lib", "staff-notes.ts")]);
  });
});

describe("Autopilot rules", () => {
  const base: AutopilotInput = {
    status: "ESTIMATING",
    autopilot: true,
    type: "PRESENTATION",
    brief: null,
    estimate: { status: "DRAFT", lines: 2, customLines: 0, unresolvedNeeds: 0, totalCredits: 28 },
    estimateGenerationFailedRecently: false,
    team: null,
    bestScoreByRole: {},
    disabledAgents: [],
  };

  it(`auto-sends a clean estimate up to ${AUTO_SEND_CREDIT_CAP} credits, never above`, () => {
    expect(planAutopilot(base).steps).toEqual([{ kind: "send_estimate" }]);
    expect(planAutopilot({ ...base, estimate: { ...base.estimate!, totalCredits: AUTO_SEND_CREDIT_CAP } }).steps).toEqual([{ kind: "send_estimate" }]);
    const over = planAutopilot({ ...base, estimate: { ...base.estimate!, totalCredits: AUTO_SEND_CREDIT_CAP + 1 } });
    expect(over.steps).toEqual([]);
    expect(over.blocked[0].reason).toMatch(/auto-send cap/);
  });

  it("doesn't auto-send with custom lines or out-of-scope items", () => {
    expect(planAutopilot({ ...base, estimate: { ...base.estimate!, customLines: 1 } }).steps).toEqual([]);
    expect(planAutopilot({ ...base, estimate: { ...base.estimate!, unresolvedNeeds: 1 } }).blocked[0].kind).toBe("estimate_needs_pm");
  });

  it("pausing stops every automatic step", () => {
    expect(planAutopilot({ ...base, autopilot: false })).toEqual({ steps: [], blocked: [] });
    expect(planAutopilot({ ...base, status: "PAUSED" })).toEqual({ steps: [], blocked: [] });
  });

  it("a disabled agent never runs (kill switch)", () => {
    const plan = planAutopilot({ ...base, estimate: null, disabledAgents: ["estimate_agent"] });
    expect(plan.steps).toEqual([]);
    expect(plan.blocked[0].kind).toBe("agent_disabled");
  });

  it(`auto-staffs only when every role scores ${AUTO_STAFF_THRESHOLD}+`, () => {
    const staffing = { ...base, status: "STAFFING" as const, estimate: null };
    expect(planAutopilot({ ...staffing, bestScoreByRole: { ART_DIRECTOR: { name: "Sara N.", score: 92 }, COPYWRITER: { name: "Marcus L.", score: 80 } } }).steps[0].kind).toBe("auto_staff");
    const weak = planAutopilot({ ...staffing, bestScoreByRole: { ART_DIRECTOR: { name: "Sara N.", score: 92 }, COPYWRITER: { name: "Marcus L.", score: 61 } } });
    expect(weak.steps).toEqual([]);
    expect(weak.blocked[0].reason).toMatch(/Marcus L\. scores 61/);
  });

  it("runAutopilot sends a clean draft, logs it and tells the client; paused projects are left alone", async () => {
    const project = await prisma.project.create({ data: { clientId: fx.clientA.id, name: "Auto deck", type: "PRESENTATION", status: "ESTIMATING" } });
    const est = await prisma.estimate.create({ data: { projectId: project.id, status: "DRAFT", totalCredits: 20 } });
    const med = await prisma.priceListItem.findUniqueOrThrow({ where: { deliverableType_complexityTier: { deliverableType: "PPT slide", complexityTier: "MEDIUM" } } });
    await prisma.estimateLineItem.create({ data: { estimateId: est.id, deliverable: "PPT slide", detail: "", quantity: 10, complexityTier: "MEDIUM", priceListItemId: med.id, credits: 20, hours: 20 } });

    await prisma.project.update({ where: { id: project.id }, data: { autopilot: false } });
    expect(await runAutopilot(project.id)).toEqual([]);
    expect((await prisma.estimate.findUniqueOrThrow({ where: { id: est.id } })).status).toBe("DRAFT");

    await prisma.project.update({ where: { id: project.id }, data: { autopilot: true } });
    expect(await runAutopilot(project.id)).toEqual(["send_estimate"]);
    expect((await prisma.estimate.findUniqueOrThrow({ where: { id: est.id } })).status).toBe("SENT");
    expect(await prisma.decisionLog.findFirst({ where: { projectId: project.id, area: "autopilot", actorUserId: null } })).not.toBeNull();
    expect(await prisma.agentRun.findFirst({ where: { projectId: project.id, decision: { contains: "sent automatically" } } })).not.toBeNull();
    expect(await prisma.comment.findFirst({ where: { projectId: project.id, kind: "SYSTEM", body: "Estimate v1 sent" } })).not.toBeNull();
    // Running again does nothing: steps re-check state, nothing is replayed.
    expect(await runAutopilot(project.id)).toEqual([]);
  });

  it("runAgentTask refuses a disabled agent without calling the model or logging a run", async () => {
    const agent = await prisma.agent.upsert({ where: { key: "test_disabled_agent" }, update: { status: "DISABLED" }, create: { key: "test_disabled_agent", name: "Test agent", category: "BRIEF", description: "x", status: "DISABLED" } });
    const result = await runAgentTask({ agentKey: agent.key, system: "x", prompt: "x", schema: z.object({ a: z.string() }) });
    expect(result.ok).toBe(false);
    expect(await prisma.agentRun.count({ where: { agentId: agent.id } })).toBe(0);
  });
});

describe("Working hours (Mon–Fri 09–17 Europe/Stockholm)", () => {
  it("counts only working time", () => {
    // Fri 2 Oct 2026 16:00 CEST → Mon 5 Oct 10:00 CEST = 1h Friday + 1h Monday.
    expect(workingHoursBetween(new Date("2026-10-02T14:00:00Z"), new Date("2026-10-05T08:00:00Z"))).toBe(2);
    // Saturday to Sunday: nothing.
    expect(workingHoursBetween(new Date("2026-10-03T08:00:00Z"), new Date("2026-10-04T15:00:00Z"))).toBe(0);
    // A full working day.
    expect(workingHoursBetween(new Date("2026-10-01T05:00:00Z"), new Date("2026-10-01T18:00:00Z"))).toBe(8);
  });
});

describe("Needs you exceptions", () => {
  it("a client message unanswered for more than 4 working hours is an exception, cleared by a staff reply", async () => {
    const project = await prisma.project.create({ data: { clientId: fx.clientA.id, name: "Waiting project", type: "PRESENTATION", status: "IN_PRODUCTION" } });
    // Wed 30 Sept 2026 09:00 CEST, checked at Wed 15:00 CEST: 6 working hours.
    const asked = new Date("2026-09-30T07:00:00Z");
    const now = new Date("2026-09-30T13:00:00Z");
    await prisma.comment.create({ data: { projectId: project.id, authorClientUserId: fx.clientUserA.id, body: "Can we reuse the Q3 charts?", createdAt: asked } });
    let [ops] = await loadOpsProjects({ id: project.id }, now);
    expect(ops.exceptions.map((e) => e.kind)).toContain("client_waiting");

    await prisma.comment.create({ data: { projectId: project.id, authorUserId: pmUserId, body: "Yes!", createdAt: new Date("2026-09-30T12:00:00Z") } });
    [ops] = await loadOpsProjects({ id: project.id }, now);
    expect(ops.exceptions.map((e) => e.kind)).not.toContain("client_waiting");
  });

  it("out-of-scope items and a second change request on one asset are exceptions", async () => {
    const project = await prisma.project.create({ data: { clientId: fx.clientA.id, name: "Scope project", type: "CAMPAIGN", status: "AWAITING_REVIEW" } });
    await prisma.estimate.create({ data: { projectId: project.id, status: "APPROVED", totalCredits: 10, unresolvedNeeds: [{ description: "Paid media setup" }] } });
    await prisma.asset.create({ data: { projectId: project.id, clientId: fx.clientA.id, name: "Hero", format: "Static 1:1", status: "CHANGES_REQUESTED", changeRequestCount: 2 } });
    const [ops] = await loadOpsProjects({ id: project.id });
    expect(ops.exceptions.map((e) => e.kind)).toEqual(expect.arrayContaining(["out_of_scope", "second_change_request"]));
  });

  it("unstarted drafts never appear in ops", async () => {
    const draft = await prisma.project.create({ data: { clientId: fx.clientA.id, name: "Private draft", type: "PRESENTATION", status: "DRAFT" } });
    expect(await loadOpsProjects({ id: draft.id })).toEqual([]);
  });
});

describe("Old delivery URLs", () => {
  it("redirect to the cockpit of the right project, never a draft", async () => {
    const client = await prisma.client.create({ data: { name: "Redirect Co", slug: `redirect-${Date.now()}` } });
    try {
      const older = await prisma.project.create({ data: { clientId: client.id, name: "Older", status: "ESTIMATING", updatedAt: new Date(Date.now() - 86400000) } });
      await prisma.pipelineStage.create({ data: { projectId: older.id, name: "ESTIMATE", order: 2, status: "ACTIVE" } });
      const newer = await prisma.project.create({ data: { clientId: client.id, name: "Newer", status: "IN_PRODUCTION" } });
      await prisma.project.create({ data: { clientId: client.id, name: "Draft", status: "DRAFT" } });

      expect(await resolveLegacyDelivery(client.id, "estimate")).toBe(`/ops/projects/${older.id}#estimate`);
      expect(await resolveLegacyDelivery(client.id, "brief")).toBe(`/ops/projects/${newer.id}#brief`);
      expect(await resolveLegacyDelivery(client.id, "production", older.id)).toBe(`/ops/projects/${older.id}#production`);
      expect(await resolveLegacyDelivery(client.id)).toBe(`/ops/projects/${newer.id}`);
    } finally {
      await prisma.client.delete({ where: { id: client.id } });
    }
  });
});
