import type { Prisma } from "@/generated/prisma";

// A confidential project is hidden from other client-side teammates — only
// its creator and the ClientUsers explicitly added as members can see it.
// This never restricts Klingit ops, which queries projects separately.
export function projectVisibilityWhere(clientUserId: string): Prisma.ProjectWhereInput {
  return {
    OR: [
      { confidential: false },
      { createdByClientUserId: clientUserId },
      { members: { some: { clientUserId } } },
    ],
  };
}

export function canManageProjectAccess(
  project: { createdByClientUserId: string | null },
  viewerClientUserId: string
) {
  return project.createdByClientUserId === viewerClientUserId;
}
