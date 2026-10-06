import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { kindOf, loadReview } from "@/lib/review";
import { textDiff } from "@/lib/review-text";
import { readFileSync } from "fs";
import { readMp4 } from "@/lib/media/mp4";
import { postTimestampCommentAction } from "@/lib/actions/project-actions";
import { acceptAllCopyAction, approveReviewItemsAction, replyThreadAction, requestReviewChangesAction, resolveCopySuggestionAction, resolveThreadAction, suggestCopyAction } from "@/lib/actions/review-actions";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;

const asClientA = () => setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
const asClientB = () => setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};

/** A project in review with an ad set (2 concepts × 2 sizes), one unsent ad, and a copy line in two languages. */
async function reviewProject() {
  const project = await prisma.project.create({ data: { clientId: fx.clientA.id, name: "Review test", type: "CAMPAIGN", status: "AWAITING_REVIEW" } });
  const asset = async (name: string, format: string, sent: boolean, extra: { type?: "IMAGE" | "COPY"; tags?: object } = {}) => {
    const a = await prisma.asset.create({ data: { projectId: project.id, clientId: fx.clientA.id, name, format, type: extra.type ?? "IMAGE", tags: extra.tags, sentVersion: sent ? 1 : null } });
    await prisma.assetVersion.create({ data: { assetId: a.id, projectId: project.id, number: 1, state: sent ? "SENT_TO_CLIENT" : "QC_READY" } });
    return a;
  };
  const sun = [await asset("Sun · Story", "Story 9:16", true), await asset("Sun · Feed", "Feed 1:1", true)];
  const moon = [await asset("Moon · Story", "Story 9:16", true), await asset("Moon · Feed", "Feed 1:1", true)];
  const unsent = await asset("Draft · Story", "Story 9:16", false);
  const copy = await asset("Headline", "Copy", true, { type: "COPY", tags: { copy: { sv: "Dela upp betalningen", no: "Del opp betalingen" } } });
  const legal = await asset("Legal line", "Copy", true, { type: "COPY", tags: { status: "locked", copy: { sv: "Kreditprövning sker" } } });
  return { project, sun, moon, unsent, copy, legal };
}

beforeAll(async () => {
  fx = await createSecurityFixtures();
});
afterAll(async () => {
  await fx.cleanup();
});

describe("textDiff", () => {
  it("marks whole words added and removed", () => {
    const d = textDiff("Dela upp betalningen", "Dela upp vardagsköpen");
    expect(d.filter((x) => x.type === "removed").map((x) => x.text.trim())).toEqual(["betalningen"]);
    expect(d.filter((x) => x.type === "added").map((x) => x.text.trim())).toEqual(["vardagsköpen"]);
  });

  it("returns the text unchanged when nothing changed", () => {
    expect(textDiff("Hent appen", "Hent appen")).toEqual([{ type: "same", text: "Hent appen" }]);
  });
});

describe("video files", () => {
  it("reads duration, frame rate, size and sound from an MP4 header", () => {
    const info = readMp4(readFileSync("prisma/demo/ouhers/creatives/p12-brand-film/dewy-by-default-9x16-v1.mp4"));
    expect(info).toEqual({ durationSeconds: 15, fps: 30, width: 1080, height: 1920, hasAudio: true });
    expect(readMp4(Buffer.from("not a video"))).toBeNull();
  });
});

describe("loadReview", () => {
  it("groups by format, reads only sent work and threads replies under their comment", async () => {
    const p = await reviewProject();
    const root = await prisma.comment.create({ data: { projectId: p.project.id, assetId: p.sun[0].id, authorClientUserId: fx.clientUserA.id, body: "Logo bigger", xPercent: 20, yPercent: 30 } });
    await prisma.comment.create({ data: { projectId: p.project.id, assetId: p.sun[0].id, authorUserId: fx.adminUser.id, body: "On it", contextKind: "reply", contextRef: root.id } });
    await prisma.comment.create({ data: { projectId: p.project.id, authorClientUserId: fx.clientUserA.id, body: "Overall great", contextKind: "set" } });

    const data = (await loadReview(p.project.id, fx.clientA.id))!;
    expect(data.items.map((i) => i.id)).not.toContain(p.unsent.id);
    expect(data.kinds).toEqual([
      { kind: "adset", count: 4, open: 4 },
      { kind: "copy", count: 2, open: 2 },
    ]);
    expect(data.threads).toHaveLength(2);
    const pinned = data.threads.find((t) => t.id === root.id)!;
    expect(pinned.number).toBe(1);
    expect(pinned.messages.map((m) => [m.body, m.fromClient])).toEqual([
      ["Logo bigger", true],
      ["On it", false],
    ]);
    expect(data.threads.find((t) => t.assetId === null)!.label).toBe("Whole set");
    const legal = data.items.find((i) => i.id === p.legal.id)!;
    expect(legal.copy!.locked).toBe(true);
    expect(data.items.find((i) => i.id === p.copy.id)!.copy!.lines[0].limit).toBe(40);

    expect(await loadReview(p.project.id, fx.clientB.id)).toBeNull();
  });

  it("tells formats apart", () => {
    expect(kindOf({ type: "COPY", format: "Copy" })).toBe("copy");
    expect(kindOf({ type: "VIDEO", format: "Story 9:16" })).toBe("video");
    expect(kindOf({ type: "IMAGE", format: "Carousel slide 3" })).toBe("slides");
    expect(kindOf({ type: "IMAGE", format: "Storyboard frame 2" })).toBe("slides");
    expect(kindOf({ type: "IMAGE", format: "Feed 1:1" })).toBe("adset");
  });
});

describe("review actions", () => {
  it("approving a concept approves all its sizes, and never unsent or other clients' work", async () => {
    const p = await reviewProject();
    asClientB();
    await approveReviewItemsAction(form({ projectId: p.project.id, assetIds: p.sun.map((a) => a.id).join(",") }));
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: p.sun[0].id } })).status).toBe("IN_REVIEW");

    asClientA();
    await approveReviewItemsAction(form({ projectId: p.project.id, assetIds: [...p.sun, p.unsent].map((a) => a.id).join(",") }));
    const after = await prisma.asset.findMany({ where: { projectId: p.project.id }, select: { id: true, status: true } });
    const status = (id: string) => after.find((a) => a.id === id)!.status;
    expect(p.sun.map((a) => status(a.id))).toEqual(["APPROVED", "APPROVED"]);
    expect(p.moon.map((a) => status(a.id))).toEqual(["IN_REVIEW", "IN_REVIEW"]);
    expect(status(p.unsent.id)).toBe("IN_REVIEW");
    const v = await prisma.assetVersion.findFirstOrThrow({ where: { assetId: p.sun[0].id } });
    expect(v.state).toBe("APPROVED");
  });

  it("request changes needs a note, then marks the items and posts on the whole set", async () => {
    const p = await reviewProject();
    asClientA();
    const ids = p.moon.map((a) => a.id).join(",");
    expect(await requestReviewChangesAction({}, form({ projectId: p.project.id, assetIds: ids, note: "" }))).toEqual({ error: "Say what should change." });
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: p.moon[0].id } })).status).toBe("IN_REVIEW");

    const r = await requestReviewChangesAction({}, form({ projectId: p.project.id, assetIds: ids, note: "Warmer colours please" }));
    expect(r.ok).toMatch(/2 items/);
    const moon = await prisma.asset.findUniqueOrThrow({ where: { id: p.moon[0].id }, include: { versions: true } });
    expect(moon.status).toBe("CHANGES_REQUESTED");
    expect(moon.versions[0].state).toBe("CHANGES_REQUESTED");
    const note = await prisma.comment.findFirstOrThrow({ where: { projectId: p.project.id, contextKind: "set" } });
    expect(note.body).toBe("Warmer colours please");
  });

  it("replies and resolves a thread together", async () => {
    const p = await reviewProject();
    const root = await prisma.comment.create({ data: { projectId: p.project.id, assetId: p.sun[1].id, authorClientUserId: fx.clientUserA.id, body: "Tighter crop", xPercent: 50, yPercent: 50 } });
    asClientA();
    await replyThreadAction(form({ threadId: root.id, body: "And brighter" }));
    await resolveThreadAction(form({ threadId: root.id, resolved: "true" }));
    const thread = await prisma.comment.findMany({ where: { OR: [{ id: root.id }, { contextRef: root.id }] } });
    expect(thread).toHaveLength(2);
    expect(thread.every((c) => c.resolved)).toBe(true);
    expect(thread.find((c) => c.id !== root.id)!.assetId).toBe(p.sun[1].id);
  });

  it("copy: suggest, reject, accept, accept all — and locked lines refuse edits", async () => {
    const p = await reviewProject();
    asClientA();
    expect((await suggestCopyAction({}, form({ assetId: p.legal.id, lang: "sv", text: "Ingen kreditprövning" }))).error).toMatch(/locked/);
    expect((await suggestCopyAction({}, form({ assetId: p.copy.id, lang: "sv", text: "Dela upp betalningen" }))).error).toBeTruthy();

    expect((await suggestCopyAction({}, form({ assetId: p.copy.id, lang: "sv", text: "Dela upp vardagsköpen", note: "Broader" }))).ok).toBeTruthy();
    let data = (await loadReview(p.project.id, fx.clientA.id))!;
    let s = data.items.find((i) => i.id === p.copy.id)!.copy!.suggestions;
    expect(s).toMatchObject([{ lang: "sv", text: "Dela upp vardagsköpen", note: "Broader" }]);

    await resolveCopySuggestionAction(form({ assetId: p.copy.id, suggestionId: s[0].id, decision: "reject" }));
    data = (await loadReview(p.project.id, fx.clientA.id))!;
    let copy = data.items.find((i) => i.id === p.copy.id)!.copy!;
    expect(copy.suggestions).toEqual([]);
    expect(copy.lines.find((l) => l.lang === "sv")!.text).toBe("Dela upp betalningen");

    await suggestCopyAction({}, form({ assetId: p.copy.id, lang: "sv", text: "Dela upp vardagsköpen" }));
    s = (await loadReview(p.project.id, fx.clientA.id))!.items.find((i) => i.id === p.copy.id)!.copy!.suggestions;
    await resolveCopySuggestionAction(form({ assetId: p.copy.id, suggestionId: s[0].id, decision: "accept" }));
    copy = (await loadReview(p.project.id, fx.clientA.id))!.items.find((i) => i.id === p.copy.id)!.copy!;
    expect(copy.lines.find((l) => l.lang === "sv")!.text).toBe("Dela upp vardagsköpen");

    await suggestCopyAction({}, form({ assetId: p.copy.id, lang: "no", text: "Del opp hverdagskjøpene" }));
    await acceptAllCopyAction(form({ projectId: p.project.id }));
    copy = (await loadReview(p.project.id, fx.clientA.id))!.items.find((i) => i.id === p.copy.id)!.copy!;
    expect(copy.lines.find((l) => l.lang === "no")!.text).toBe("Del opp hverdagskjøpene");
    expect(copy.suggestions).toEqual([]);

    asClientB();
    expect((await suggestCopyAction({}, form({ assetId: p.copy.id, lang: "sv", text: "Hej" }))).error).toMatch(/isn't in your review/);
  });

  it("video comments: a moment, a range with a pin on the frame; a range must end after it starts", async () => {
    const p = await reviewProject();
    const film = await prisma.asset.create({ data: { projectId: p.project.id, clientId: fx.clientA.id, name: "Film", format: "Story 9:16", type: "VIDEO", sentVersion: 1, durationSeconds: 15 } });
    await prisma.assetVersion.create({ data: { assetId: film.id, projectId: p.project.id, number: 1, state: "SENT_TO_CLIENT" } });
    asClientA();
    const post = (o: Record<string, string>) => postTimestampCommentAction({}, form({ projectId: p.project.id, assetId: film.id, ...o }));
    await post({ body: "Later", timestampSeconds: "8" });
    await post({ body: "Hold longer", timestampSeconds: "2", timestampEndSeconds: "5.4", xPercent: "33", yPercent: "63" });
    await post({ body: "Backwards range", timestampSeconds: "6", timestampEndSeconds: "4" });
    const threads = (await loadReview(p.project.id, fx.clientA.id))!.threads.filter((t) => t.assetId === film.id);
    expect(threads.map((t) => [t.number, t.timestamp, t.timestampEnd, t.pin && [t.pin.x, t.pin.y], t.messages[0].body])).toEqual([
      [1, 2, 5.4, [33, 63], "Hold longer"],
      [2, 6, null, null, "Backwards range"],
      [3, 8, null, null, "Later"],
    ]);
  });
});
