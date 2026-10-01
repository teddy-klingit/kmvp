import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { setMockSession, authMocks } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { deleteClientCalendarItemAction } from "@/lib/actions/calendar-actions";
import { pauseClientAction } from "@/lib/actions/ops-client-admin-actions";
import { generateInvoiceAction } from "@/lib/actions/ops-billing-actions";
import { updateAgentStatusAction } from "@/lib/actions/ops-agent-actions";
import { switchPersonaAction } from "@/lib/actions/persona-actions";
import { postCommentAction, approveEstimateAction, signOffProjectAction } from "@/lib/actions/project-actions";
import ProjectOverviewPage from "@/app/(portal)/projects/[id]/page";
import { ForbiddenError } from "@/lib/authz";

describe("cross-client access", () => {
  it("Client B cannot delete Client A's calendar item", async () => {
    const fx = await createSecurityFixtures();
    try {
      setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });

      const formData = new FormData();
      formData.set("id", fx.calendarItemA.id);
      await deleteClientCalendarItemAction(formData);

      const stillThere = await prisma.clientCalendarItem.findUnique({ where: { id: fx.calendarItemA.id } });
      expect(stillThere).not.toBeNull();
    } finally {
      await fx.cleanup();
    }
  });

  it("Client A can delete its own calendar item (control case)", async () => {
    const fx = await createSecurityFixtures();
    try {
      setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });

      const formData = new FormData();
      formData.set("id", fx.calendarItemA.id);
      await deleteClientCalendarItemAction(formData);

      const gone = await prisma.clientCalendarItem.findUnique({ where: { id: fx.calendarItemA.id } });
      expect(gone).toBeNull();
    } finally {
      await fx.cleanup();
    }
  });

  it("Client B cannot view Client A's project overview", async () => {
    const fx = await createSecurityFixtures();
    try {
      setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
      await expect(ProjectOverviewPage({ params: Promise.resolve({ id: fx.projectA.id }) })).rejects.toThrow();
    } finally {
      await fx.cleanup();
    }
  });

  it("Client B cannot post a message on Client A's project", async () => {
    const fx = await createSecurityFixtures();
    try {
      setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });

      const formData = new FormData();
      formData.set("projectId", fx.projectA.id);
      formData.set("body", "I shouldn't be able to post this");
      await postCommentAction(formData);

      const comments = await prisma.comment.findMany({ where: { projectId: fx.projectA.id } });
      expect(comments).toHaveLength(0);
    } finally {
      await fx.cleanup();
    }
  });

  it("Client B cannot approve Client A's estimate", async () => {
    const fx = await createSecurityFixtures();
    try {
      setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });

      const formData = new FormData();
      formData.set("estimateId", fx.estimateA.id);
      await approveEstimateAction(formData);

      const unchanged = await prisma.estimate.findUnique({ where: { id: fx.estimateA.id } });
      expect(unchanged?.status).toBe("SENT");
    } finally {
      await fx.cleanup();
    }
  });

  it("Client B cannot sign off on Client A's project", async () => {
    const fx = await createSecurityFixtures();
    try {
      setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });

      const formData = new FormData();
      formData.set("projectId", fx.projectA.id);
      formData.set("rating", "5");
      await signOffProjectAction(formData);

      const unchanged = await prisma.project.findUnique({ where: { id: fx.projectA.id } });
      expect(unchanged?.status).toBe("BRIEFING");
    } finally {
      await fx.cleanup();
    }
  });

  it("Client A can approve its own estimate and sign off (control case)", async () => {
    const fx = await createSecurityFixtures();
    try {
      setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });

      const approveForm = new FormData();
      approveForm.set("estimateId", fx.estimateA.id);
      await approveEstimateAction(approveForm);
      const approved = await prisma.estimate.findUnique({ where: { id: fx.estimateA.id } });
      expect(approved?.status).toBe("APPROVED");

      // Sign-off is only accepted at the final stage.
      await prisma.project.update({ where: { id: fx.projectA.id }, data: { status: "IN_FEEDBACK" } });
      const signOffForm = new FormData();
      signOffForm.set("projectId", fx.projectA.id);
      signOffForm.set("rating", "5");
      await signOffProjectAction(signOffForm);
      const delivered = await prisma.project.findUnique({ where: { id: fx.projectA.id } });
      expect(delivered?.status).toBe("DELIVERED");
    } finally {
      await fx.cleanup();
    }
  });
});

describe("role escalation", () => {
  it("a Creator-tier staff member cannot pause a client (Admin-only action)", async () => {
    const fx = await createSecurityFixtures();
    try {
      setMockSession({ user: { id: fx.creatorUser.id, role: "INTERNAL" } });

      const formData = new FormData();
      formData.set("clientId", fx.clientA.id);
      await expect(pauseClientAction(formData)).rejects.toThrow(ForbiddenError);

      const unchanged = await prisma.client.findUnique({ where: { id: fx.clientA.id } });
      expect(unchanged?.status).toBe("ONBOARDING");
    } finally {
      await fx.cleanup();
    }
  });

  it("a Creator-tier staff member cannot generate an invoice (Admin-only action)", async () => {
    const fx = await createSecurityFixtures();
    try {
      setMockSession({ user: { id: fx.creatorUser.id, role: "INTERNAL" } });
      await expect(generateInvoiceAction(new FormData())).rejects.toThrow(ForbiddenError);
    } finally {
      await fx.cleanup();
    }
  });

  it("a Creator-tier staff member cannot flip an agent's status (Admin-only action)", async () => {
    const fx = await createSecurityFixtures();
    try {
      setMockSession({ user: { id: fx.creatorUser.id, role: "INTERNAL" } });
      await expect(updateAgentStatusAction(new FormData())).rejects.toThrow(ForbiddenError);
    } finally {
      await fx.cleanup();
    }
  });

  it("an Admin-tier staff member CAN pause a client (control case)", async () => {
    const fx = await createSecurityFixtures();
    try {
      setMockSession({ user: { id: fx.adminUser.id, role: "INTERNAL" } });

      const formData = new FormData();
      formData.set("clientId", fx.clientA.id);
      await pauseClientAction(formData);

      const paused = await prisma.client.findUnique({ where: { id: fx.clientA.id } });
      expect(paused?.status).toBe("PAUSED");
    } finally {
      await fx.cleanup();
    }
  });
});

describe("persona switch", () => {
  afterEach(() => setMockSession(null));

  it("refuses to sign in as a persona with no existing session", async () => {
    setMockSession(null);
    const formData = new FormData();
    formData.set("persona", "admin");
    await switchPersonaAction(formData);
    expect(authMocks.signIn).not.toHaveBeenCalled();
  });

  it("a CLIENT session can switch persona (demo MVP: easy switching for everyone signed in)", async () => {
    const fx = await createSecurityFixtures();
    try {
      setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
      const formData = new FormData();
      formData.set("persona", "spotify");
      await switchPersonaAction(formData);
      expect(authMocks.signIn).toHaveBeenCalledTimes(1);
    } finally {
      await fx.cleanup();
    }
  });

  it("a Creator-tier INTERNAL session can switch persona", async () => {
    const fx = await createSecurityFixtures();
    try {
      setMockSession({ user: { id: fx.creatorUser.id, role: "INTERNAL" } });
      const formData = new FormData();
      formData.set("persona", "admin");
      await switchPersonaAction(formData);
      expect(authMocks.signIn).toHaveBeenCalledTimes(1);
    } finally {
      await fx.cleanup();
    }
  });

  it("an Admin-tier INTERNAL session CAN switch persona (control case)", async () => {
    const fx = await createSecurityFixtures();
    try {
      setMockSession({ user: { id: fx.adminUser.id, role: "INTERNAL" } });
      const formData = new FormData();
      formData.set("persona", "client");
      await switchPersonaAction(formData);
      expect(authMocks.signIn).toHaveBeenCalledTimes(1);
    } finally {
      await fx.cleanup();
    }
  });
});
