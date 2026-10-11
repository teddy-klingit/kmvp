import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { connectOwnModelAction, disconnectConnectionAction } from "@/lib/actions/connection-actions";
import { ownModelConnection } from "@/lib/ai-credits";
import { listBrandConnections } from "@/lib/brand-sources-data";
import { decryptSecret, encryptSecret, redactDeep, redactSecrets } from "@/lib/secrets";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
let member: { userId: string };
const KEY = "sk-ant-api03-TESTKEYabcdefghijklmnop0123456789-QRST";
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const asAdmin = () => setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
const asMember = () => setMockSession({ user: { id: member.userId, role: "CLIENT" } });

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const u = await prisma.user.create({ data: { name: "Member M", email: `member-${Date.now()}@test.local`, role: "CLIENT", status: "ACTIVE" } });
  await prisma.clientUser.create({ data: { userId: u.id, clientId: fx.clientA.id, permission: "APPROVER" } });
  member = { userId: u.id };
});
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { clientId: fx.clientA.id } });
  await prisma.user.delete({ where: { id: member.userId } });
  await fx.cleanup();
});

describe("clients' own AI keys", () => {
  it("are encrypted at rest: the database never holds the key", async () => {
    asAdmin();
    expect(await connectOwnModelAction({}, form({ app: "claude", apiKey: KEY }))).toEqual({ ok: "Claude (Anthropic) connected." });
    const row = await prisma.brandConnection.findUniqueOrThrow({ where: { clientId_app: { clientId: fx.clientA.id, app: "claude" } } });
    expect(JSON.stringify(row)).not.toContain(KEY);
    expect(JSON.stringify(row)).not.toContain("TESTKEY");
    expect(row.meta).toMatchObject({ last4: "QRST" });
    expect(decryptSecret((row.meta as { encryptedKey: string }).encryptedKey)).toBe(KEY);
  });

  it("can't be read without the server secret, and tampering fails closed", () => {
    const blob = encryptSecret(KEY);
    const secret = process.env.AI_KEY_ENCRYPTION_SECRET;
    process.env.AI_KEY_ENCRYPTION_SECRET = "a-different-secret-that-is-long-enough-000000";
    expect(decryptSecret(blob)).toBeNull();
    process.env.AI_KEY_ENCRYPTION_SECRET = secret;
    expect(decryptSecret(blob.slice(0, -4) + "AAAA")).toBeNull();
  });

  it("never reach a page: connection lists leave meta out", async () => {
    const rows = await listBrandConnections(fx.clientA.id);
    expect(rows.some((r) => r.app === "claude")).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("encryptedKey");
    expect(rows.every((r) => !("meta" in r))).toBe(true);
  });

  it("are used only for their own client's runs", async () => {
    expect((await ownModelConnection(fx.clientA.id))?.apiKey).toBe(KEY);
    expect(await ownModelConnection(fx.clientB.id)).toBeNull();
  });

  it("only admins add, replace or remove them, and every change is logged without the key", async () => {
    asMember();
    expect(await connectOwnModelAction({}, form({ app: "claude", apiKey: KEY.replace("QRST", "MMMM") }))).toEqual({ error: "Only an admin on your account can change connections." });
    await disconnectConnectionAction(form({ app: "claude" }));
    expect(await ownModelConnection(fx.clientA.id)).not.toBeNull();

    asAdmin();
    expect(await connectOwnModelAction({}, form({ app: "claude", apiKey: KEY.replace("QRST", "9999") }))).toEqual({ ok: "Claude (Anthropic) key replaced." });
    await disconnectConnectionAction(form({ app: "claude" }));
    const log = await prisma.auditLog.findMany({ where: { clientId: fx.clientA.id, area: "ai-keys" }, orderBy: { createdAt: "asc" } });
    expect(log.map((l) => l.action)).toEqual(["Added the Claude (Anthropic) key (ending QRST)", "Replaced the Claude (Anthropic) key (ending 9999)", "Removed the Claude (Anthropic) key"]);
    expect(JSON.stringify(log)).not.toContain("TESTKEY");
    expect(log.every((l) => l.actorUserId === fx.userA.id)).toBe(true);
  });

  it("removing a key deletes it", async () => {
    expect(await prisma.brandConnection.count({ where: { clientId: fx.clientA.id, app: "claude" } })).toBe(0);
    expect(await ownModelConnection(fx.clientA.id)).toBeNull();
  });
});

describe("redaction", () => {
  it("masks keys and tokens in text, errors and nested records", () => {
    const text = `401 from provider: invalid x-api-key ${KEY}; also sk-proj-ABCDEFGHIJKLMNOPQRSTUV and Authorization: Bearer abc.def.ghijklmnop`;
    const out = redactSecrets(text);
    expect(out).not.toContain("TESTKEY");
    expect(out).not.toContain("ABCDEFGHIJKLMNOP");
    expect(out).not.toContain("abc.def.ghijklmnop");
    expect(redactSecrets("custom-key-value-123456 failed", ["custom-key-value-123456"])).toBe("[redacted] failed");
    const deep = redactDeep({ error: new Error(`bad key ${KEY}`), rows: [{ note: KEY }] });
    expect(JSON.stringify({ ...deep, error: deep.error.message })).not.toContain("TESTKEY");
  });
});
