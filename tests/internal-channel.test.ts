import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { listInternalMessages, createInternalMessage } from "@/lib/internal-messages";
import { postInternalMessageAction, markChannelReadAction } from "@/lib/actions/conversation-actions";
import { loadProjectConversation } from "@/lib/project-conversation";
import type { InternalRole } from "@/generated/prisma";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const staffByRole: Partial<Record<InternalRole, string>> = {};
const ROLES: InternalRole[] = ["ADMIN", "ACCOUNT_LEAD", "PROJECT_MANAGER", "ART_DIRECTOR", "COPYWRITER", "MOTION_DESIGNER"];
const extraUserIds: string[] = [];

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const stamp = Date.now().toString(36);
  for (const role of ROLES) {
    const user = await prisma.user.create({
      data: { name: `${role} staff`, email: `${role.toLowerCase()}-${stamp}@test.local`, role: "INTERNAL", status: "ACTIVE" },
    });
    await prisma.staffMember.create({ data: { userId: user.id, title: role } });
    staffByRole[role] = user.id;
    extraUserIds.push(user.id);
  }
  setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
  await createInternalMessage(fx.projectA.id, "Can we push this to next sprint? Don't tell Klingit yet.");
});

afterAll(async () => {
  await fx.cleanup();
  await prisma.user.deleteMany({ where: { id: { in: extraUserIds } } });
});

describe("Internal channel — client org only", () => {
  it("the client's own member reads it", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const messages = await listInternalMessages(fx.projectA.id);
    expect(messages.map((m) => m.body)).toEqual(["Can we push this to next sprint? Don't tell Klingit yet."]);
  });

  it.each(ROLES)("Klingit staff (%s) gets nothing back from the loader", async (role) => {
    setMockSession({ user: { id: staffByRole[role]!, role: "INTERNAL" } });
    expect(await listInternalMessages(fx.projectA.id)).toEqual([]);
  });

  it.each(ROLES)("Klingit staff (%s) cannot post", async (role) => {
    setMockSession({ user: { id: staffByRole[role]!, role: "INTERNAL" } });
    const fd = new FormData();
    fd.set("projectId", fx.projectA.id);
    fd.set("body", `posted by ${role}`);
    await postInternalMessageAction(fd);
    expect(await prisma.clientInternalMessage.count({ where: { body: `posted by ${role}` } })).toBe(0);
  });

  it("a session claiming CLIENT role for a staff user id gets nothing either", async () => {
    setMockSession({ user: { id: staffByRole.ADMIN!, role: "CLIENT" } });
    expect(await listInternalMessages(fx.projectA.id)).toEqual([]);
  });

  it("another client gets nothing and cannot post", async () => {
    setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
    expect(await listInternalMessages(fx.projectA.id)).toEqual([]);
    expect(await createInternalMessage(fx.projectA.id, "from B")).toBeNull();
  });

  it("no session gets nothing", async () => {
    setMockSession(null);
    expect(await listInternalMessages(fx.projectA.id)).toEqual([]);
  });

  it("a teammate without access to a confidential project gets nothing", async () => {
    const mate = await prisma.user.create({
      data: { name: "Mate", email: `mate-${Date.now()}@test.local`, role: "CLIENT", status: "ACTIVE" },
    });
    extraUserIds.push(mate.id);
    await prisma.clientUser.create({ data: { userId: mate.id, clientId: fx.clientA.id, permission: "VIEWER" } });
    await prisma.project.update({
      where: { id: fx.projectA.id },
      data: { confidential: true, createdByClientUserId: fx.clientUserA.id },
    });
    try {
      setMockSession({ user: { id: mate.id, role: "CLIENT" } });
      expect(await listInternalMessages(fx.projectA.id)).toEqual([]);
    } finally {
      await prisma.project.update({ where: { id: fx.projectA.id }, data: { confidential: false } });
    }
  });

  it("only src/lib/internal-messages.ts queries the table", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== "generated") walk(path);
        } else if (/\.(ts|tsx)$/.test(name) && readFileSync(path, "utf8").includes("clientInternalMessage")) {
          offenders.push(path);
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([join("src", "lib", "internal-messages.ts")]);
  });
});

describe("unread indicators", () => {
  it("a teammate's internal message is unread until the channel is opened", async () => {
    const mate = await prisma.user.create({
      data: { name: "Mate Two", email: `mate2-${Date.now()}@test.local`, role: "CLIENT", status: "ACTIVE" },
    });
    extraUserIds.push(mate.id);
    await prisma.clientUser.create({ data: { userId: mate.id, clientId: fx.clientA.id, permission: "APPROVER" } });

    setMockSession({ user: { id: mate.id, role: "CLIENT" } });
    const viewer = await prisma.clientUser.findUniqueOrThrow({ where: { userId: mate.id }, include: { user: true, client: true } });
    expect((await loadProjectConversation(fx.projectA.id, viewer)).unread.internal).toBe(1);

    await markChannelReadAction(fx.projectA.id, "INTERNAL");
    expect((await loadProjectConversation(fx.projectA.id, viewer)).unread.internal).toBe(0);
  });

  it("your own messages never count as unread", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const viewer = await prisma.clientUser.findUniqueOrThrow({ where: { userId: fx.userA.id }, include: { user: true, client: true } });
    expect((await loadProjectConversation(fx.projectA.id, viewer)).unread.internal).toBe(0);
  });
});
