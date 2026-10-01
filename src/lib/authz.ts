import { prisma } from "@/lib/prisma";
import { getOpsViewer } from "@/lib/current-viewer";
import { roleTierFor, type RoleTier } from "@/lib/role-tier";

export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do this.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Every ops server action that's meant for a specific staff tier should
 * call this first — getOpsViewer() alone only confirms "some internal
 * staff member," never which tier, so without this any Creator-tier
 * session can call an Admin-only action directly. */
export async function requireOpsRole(allowed: RoleTier[]) {
  const viewer = await getOpsViewer();
  const tier = roleTierFor(viewer.title);
  if (!allowed.includes(tier)) throw new ForbiddenError();
  return viewer;
}

/** For the handful of ops actions that take an id + a separate clientId
 * from the same form without checking they actually belong together — a
 * stale or tampered form could otherwise mutate the wrong client's data.
 * Returns null (not throw) so existing "if (!x) return" call sites need
 * only a one-line change. */
export async function requireClientApp(appId: string, clientId: string) {
  return prisma.clientApp.findFirst({ where: { id: appId, clientId } });
}

export async function requireTeamMemberInClient(teamMemberId: string, clientId: string) {
  return prisma.teamMember.findFirst({
    where: { id: teamMemberId, team: { project: { clientId } } },
    include: { team: true },
  });
}
