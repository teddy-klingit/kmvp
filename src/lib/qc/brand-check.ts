import { prisma } from "@/lib/prisma";
import { readUpload } from "@/lib/uploads";
import { imageSize } from "@/lib/qc/image-size";
import { specChecks, type CheckResult } from "@/lib/qc/specs";
import { visionChecks } from "@/lib/qc/vision-check";
import { notifyMany } from "@/lib/notifier";

/**
 * The Brand OS check, run on every new version before anyone sends it: platform specs (deterministic) plus the
 * brand compliance agent on images. Failures become QC flags for the quality check screen. Klingit only: the
 * client sees nothing of this beyond "Quality checked by Klingit · N checks" on work that was sent.
 */

export type StoredCheck = { key: string; label: string; source: string; passed: boolean };

const VISION_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
type VisionType = (typeof VISION_TYPES)[number];

async function checksFor(versionId: string): Promise<{ results: CheckResult[]; runId: string | null; width: number | null; height: number | null }> {
  const v = await prisma.assetVersion.findUniqueOrThrow({ where: { id: versionId }, include: { asset: { include: { client: { include: { brandOS: true } } } } } });
  const { asset } = v;
  const data = v.storageKey ? await readUpload(v.storageKey) : null;
  const size = data && v.mimeType?.startsWith("image/") ? imageSize(data) : null;
  const width = size?.width ?? v.width;
  const height = size?.height ?? v.height;
  const results = specChecks({ format: asset.format, platform: asset.platform, mimeType: data ? v.mimeType : null, sizeBytes: v.sizeBytes, width, height });
  let runId: string | null = null;
  if (data && VISION_TYPES.includes(v.mimeType as VisionType)) {
    const brand = asset.client.brandOS;
    const vision = await visionChecks({
      clientId: asset.clientId,
      projectId: asset.projectId,
      asset: { name: asset.name, format: asset.format, platform: asset.platform },
      image: { mediaType: v.mimeType as VisionType, data: data.toString("base64") },
      brand: { clientName: asset.client.name, toneRules: brand?.toneRules, dos: brand?.dos, donts: brand?.donts, colors: brand?.colorPalette ?? brand?.approvedColors },
    });
    results.push(...vision.results);
    runId = vision.runId;
  }
  return { results, runId, width, height };
}

const stored = (results: CheckResult[]): StoredCheck[] => results.map(({ key, label, source, passed }) => ({ key, label, source, passed }));

/** Checks a new version: CHECKING → results and flags → QC_READY, ready for the quality check. */
export async function runBrandCheck(versionId: string) {
  const v = await prisma.assetVersion.update({ where: { id: versionId }, data: { state: "CHECKING" } });
  try {
    const { results, runId, width, height } = await checksFor(versionId);
    await prisma.$transaction([
      prisma.qcFlag.deleteMany({ where: { versionId, status: "OPEN", late: false } }),
      ...results
        .filter((r) => !r.passed && r.flag)
        .map((r) => prisma.qcFlag.create({ data: { versionId, projectId: v.projectId, checkKey: r.key, label: r.flag!.label, detail: r.flag!.detail, source: r.source } })),
      prisma.assetVersion.update({ where: { id: versionId }, data: { state: "QC_READY", checks: stored(results), checkRunId: runId, checkedAt: new Date(), width, height } }),
    ]);
  } catch (err) {
    // A check that couldn't run still hands the version to the quality check, with nothing marked as passed.
    await prisma.assetVersion.update({ where: { id: versionId }, data: { state: "QC_READY", checks: [], checkedAt: new Date() } });
    console.error("Brand OS check failed", err);
  }
}

/** The people who own a project's quality: its PM / account lead on the team, else the client's account lead. */
export async function projectPmUserIds(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { team: { include: { members: { include: { staffMember: true } } } }, client: { include: { accountLead: true } } },
  });
  if (!project) return [];
  const team = (project.team?.members ?? []).map((m) => m.staffMember).filter((s) => s.title === "PROJECT_MANAGER" || s.title === "ACCOUNT_LEAD").map((s) => s.userId);
  if (team.length) return [...new Set(team)];
  return project.client.accountLead ? [project.client.accountLead.userId] : [];
}

/**
 * Re-checks every version a client of this account already has (e.g. after the Brand OS changed). A check that
 * now fails becomes a late flag and goes to the PM, never to the client: the client's view doesn't change.
 */
export async function recheckSentVersions(clientId: string) {
  const versions = await prisma.assetVersion.findMany({ where: { state: { in: ["SENT_TO_CLIENT", "APPROVED", "CHANGES_REQUESTED"] }, asset: { clientId, status: { not: "ARCHIVED" } } }, include: { asset: true } });
  let raised = 0;
  for (const v of versions) {
    // Only the version the client has now.
    if (v.asset.sentVersion !== v.number) continue;
    const before = (v.checks as StoredCheck[] | null) ?? [];
    const { results } = await checksFor(v.id).catch(() => ({ results: [] as CheckResult[] }));
    const fresh = results.filter((r) => !r.passed && r.flag && !before.some((b) => b.key === r.key && !b.passed));
    const existing = await prisma.qcFlag.findMany({ where: { versionId: v.id, late: true, status: { not: "ACCEPTED" } }, select: { checkKey: true } });
    const add = fresh.filter((r) => !existing.some((e) => e.checkKey === r.key));
    if (add.length === 0) continue;
    await prisma.qcFlag.createMany({ data: add.map((r) => ({ versionId: v.id, projectId: v.projectId, checkKey: r.key, label: r.flag!.label, detail: r.flag!.detail, source: r.source, late: true })) });
    raised += add.length;
    const pms = await projectPmUserIds(v.projectId);
    await notifyMany(pms.map((userId) => ({
        userId,
        clientId,
        projectId: v.projectId,
        type: "SYSTEM" as const,
        title: "A sent asset no longer passes the Brand OS check",
        body: `${v.asset.name} v${v.number}: ${add.map((r) => r.flag!.detail).join("; ")}. The client hasn't been told.`,
        actionUrl: `/ops/projects/${v.projectId}/qc`,
        actionLabel: "Open quality check",
      })));
  }
  return raised;
}
