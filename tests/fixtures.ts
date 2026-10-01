import { prisma } from "@/lib/prisma";

/** Creates two isolated clients (A and B) with a project/brief/calendar
 * item each, plus an Admin and a Creator staff member — everything a
 * cross-client or role-escalation test needs. Call `cleanup()` afterward;
 * client/user deletes cascade to everything created under them. */
export async function createSecurityFixtures() {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  const clientA = await prisma.client.create({
    data: { name: `Test Client A ${stamp}`, slug: `test-client-a-${stamp}` },
  });
  const clientB = await prisma.client.create({
    data: { name: `Test Client B ${stamp}`, slug: `test-client-b-${stamp}` },
  });

  const brandOSA = await prisma.brandOS.create({ data: { clientId: clientA.id } });

  const userA = await prisma.user.create({
    data: { name: "Client A Owner", email: `client-a-${stamp}@test.local`, role: "CLIENT", status: "ACTIVE" },
  });
  const clientUserA = await prisma.clientUser.create({
    data: { userId: userA.id, clientId: clientA.id, permission: "OWNER" },
  });

  const userB = await prisma.user.create({
    data: { name: "Client B Owner", email: `client-b-${stamp}@test.local`, role: "CLIENT", status: "ACTIVE" },
  });
  const clientUserB = await prisma.clientUser.create({
    data: { userId: userB.id, clientId: clientB.id, permission: "OWNER" },
  });

  const projectA = await prisma.project.create({
    data: { clientId: clientA.id, name: "A's project", type: "SINGLE_ASSET", status: "BRIEFING" },
  });
  const briefA = await prisma.brief.create({
    data: { projectId: projectA.id, status: "ACCEPTED", goals: "original goal", targetAudience: "original audience" },
  });
  const calendarItemA = await prisma.clientCalendarItem.create({
    data: { clientId: clientA.id, title: "A's calendar item", date: new Date(), channel: "Other" },
  });
  const estimateA = await prisma.estimate.create({
    data: { projectId: projectA.id, status: "SENT", totalCredits: 20, sentAt: new Date() },
  });

  const adminUser = await prisma.user.create({
    data: { name: "Admin Staff", email: `admin-${stamp}@test.local`, role: "INTERNAL", status: "ACTIVE" },
  });
  const adminStaff = await prisma.staffMember.create({ data: { userId: adminUser.id, title: "ADMIN" } });

  const creatorUser = await prisma.user.create({
    data: { name: "Creator Staff", email: `creator-${stamp}@test.local`, role: "INTERNAL", status: "ACTIVE" },
  });
  const creatorStaff = await prisma.staffMember.create({ data: { userId: creatorUser.id, title: "ART_DIRECTOR" } });

  async function cleanup() {
    await prisma.client.deleteMany({ where: { id: { in: [clientA.id, clientB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id, adminUser.id, creatorUser.id] } } });
  }

  return {
    clientA,
    clientB,
    brandOSA,
    userA,
    clientUserA,
    userB,
    clientUserB,
    projectA,
    briefA,
    calendarItemA,
    estimateA,
    adminUser,
    adminStaff,
    creatorUser,
    creatorStaff,
    cleanup,
  };
}
