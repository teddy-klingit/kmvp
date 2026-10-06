import type { AssetVersionState, Prisma } from "@/generated/prisma";

/**
 * The quality check is Klingit's: a client never sees a version before it's sent to them. Every client-facing
 * asset query adds `clientVisibleAsset`, and every client-facing version query `clientVisibleVersion`; the file
 * API checks the same rules (src/lib/asset-files.ts, /api/assets/[assetId]/versions/[number]).
 */
export const CLIENT_VERSION_STATES: AssetVersionState[] = ["SENT_TO_CLIENT", "APPROVED", "CHANGES_REQUESTED"];

export const clientVisibleAsset = { sentVersion: { not: null } } satisfies Prisma.AssetWhereInput;

export const clientVisibleVersion = { state: { in: CLIENT_VERSION_STATES } } satisfies Prisma.AssetVersionWhereInput;

export const isClientVisibleVersion = (state: AssetVersionState) => CLIENT_VERSION_STATES.includes(state);
