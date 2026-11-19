import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { addToNextReview, bookCheckIn, checkIns, createNote, getProfile, klingitTeam, listNotes, mentionedStaff, pinnedNotes, readsFor, saveProfile, setPinned, setRead, splitNote } from "@/lib/client-notes";

/** Phase T2: notes, profile and relationship are staff only, enforced on the server. */
type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const asAdmin = () => setMockSession({ user: { id: fx.adminUser.id, role: "INTERNAL" } });
const asClient = () => setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
const asCreative = () => setMockSession({ user: { id: fx.creatorUser.id, role: "INTERNAL" } });

beforeAll(async () => {
  fx = await createSecurityFixtures();
});
afterAll(async () => {
  await prisma.keyMoment.deleteMany({ where: { clientId: fx.clientA.id } });
  await fx.cleanup();
});

describe("Phase T2: the account log", () => {
  it("splits a note into a title and a body", () => {
    expect(splitNote("Maja wants fewer, bigger campaigns in 2027. Monthly review went well.")).toEqual({ title: "Maja wants fewer, bigger campaigns in 2027", body: "Monthly review went well." });
    expect(splitNote("Line one\nLine two")).toEqual({ title: "Line one", body: "Line two" });
    expect(splitNote("Short", "Given title")).toEqual({ title: "Given title", body: "Short" });
  });

  it("a staff member writes, pins (at most 3) and filters notes; a mention notifies; a project note reaches its staff discussion", async () => {
    asAdmin();
    const creator = await prisma.user.findUniqueOrThrow({ where: { id: fx.creatorUser.id } });
    const first = creator.name.split(" ")[0];
    expect(await mentionedStaff(`Ask @${first} about it`)).toEqual([creator.id]);
    const n = await createNote(fx.clientA.id, { kind: "call", text: `Call about the reel. @${first} should cut it.`, projectId: fx.projectA.id, durationMin: 15, kickoff: true, tags: ["Video"] });
    expect(n).toMatchObject({ kind: "call", title: "Call about the reel", durationMin: 15, kickoff: true });
    expect(await prisma.notification.count({ where: { userId: creator.id, clientId: fx.clientA.id } })).toBe(1);
    expect(await prisma.projectStaffNote.count({ where: { projectId: fx.projectA.id, body: { contains: "Call about the reel" } } })).toBe(1);
    for (const t of ["One", "Two", "Three", "Four"]) await createNote(fx.clientA.id, { kind: "decision", text: `${t} decision`, pin: true });
    expect((await pinnedNotes(fx.clientA.id)).map((p) => p.title)).toEqual(["Four decision", "Three decision", "Two decision"]);
    await setPinned(fx.clientA.id, n!.id, true);
    expect(await pinnedNotes(fx.clientA.id)).toHaveLength(3);
    expect((await listNotes(fx.clientA.id, { kind: "call" })).map((x) => x.title)).toEqual(["Call about the reel"]);
  });

  it("at risk needs a reason, kept as a Risk note, and shows for the Clients list", async () => {
    asAdmin();
    expect(await setRead(fx.clientA.id, "at_risk", "")).toMatchObject({ error: expect.any(String) });
    expect(await setRead(fx.clientA.id, "at_risk", "Third pack request in three months")).toEqual({ ok: true });
    expect((await readsFor([fx.clientA.id])).get(fx.clientA.id)).toEqual({ read: "at_risk", reason: "Third pack request in three months" });
    expect((await listNotes(fx.clientA.id, { kind: "risk" }))[0].title).toBe("Marked at risk");
  });

  it("profile key dates become this client's key moments; Add to next review books a check-in if none is", async () => {
    asAdmin();
    await saveProfile(fx.clientA.id, { goal: "+40% online sales", markets: "SE, NO", keyDates: [{ name: "Winter launch", date: "2026-11-20" }, { name: "bad", date: "soon" }] });
    expect((await getProfile(fx.clientA.id))?.keyDates).toEqual([{ name: "Winter launch", date: "2026-11-20" }]);
    expect(await prisma.keyMoment.findMany({ where: { clientId: fx.clientA.id }, select: { name: true, markets: true } })).toEqual([{ name: "Winter launch", markets: ["SE", "NO"] }]);
    const note = await addToNextReview(fx.clientA.id, "Creative ran over 40 in 2 of the last 3 months");
    const { next } = await checkIns(fx.clientA.id);
    expect(next).not.toBeNull();
    expect(note?.checkInId).toBe(next!.id);
    await bookCheckIn(fx.clientA.id, new Date(Date.now() + 3 * 86400000), "monthly review");
    expect((await checkIns(fx.clientA.id)).next?.kind).toBe("monthly review");
  });

  it("the Klingit team lists the PM and the creatives who worked on the client", async () => {
    asAdmin();
    const t = await klingitTeam(fx.clientA.id);
    expect(t).toHaveProperty("creatives");
  });
});

describe("Phase T2: staff only, on the server", () => {
  it("a client user gets nothing from any notes, profile or relationship function", async () => {
    asClient();
    for (const call of [() => listNotes(fx.clientA.id), () => pinnedNotes(fx.clientA.id), () => getProfile(fx.clientA.id), () => checkIns(fx.clientA.id), () => readsFor([fx.clientA.id]), () => klingitTeam(fx.clientA.id), () => createNote(fx.clientA.id, { kind: "note", text: "x" }), () => saveProfile(fx.clientA.id, { goal: "x" }), () => setRead(fx.clientA.id, "happy")]) {
      await expect(call()).rejects.toThrow(/REDIRECT/);
    }
  });

  it("a creative (not a PM or admin) is refused too", async () => {
    asCreative();
    await expect(listNotes(fx.clientA.id)).rejects.toThrow(/permission/);
  });

  it("only src/lib/client-notes.ts queries ClientNote, ClientProfile and ClientCheckIn", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== "generated") walk(path);
        } else if (/\.(ts|tsx)$/.test(name) && /prisma\.(clientNote|clientProfile|clientCheckIn)\b/.test(readFileSync(path, "utf8")) && !path.endsWith(join("lib", "client-notes.ts")) && !path.includes(join("lib", "demo"))) {
          offenders.push(path);
        }
      }
    };
    walk(join(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });
});
