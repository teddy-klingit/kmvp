import { prisma } from "../src/lib/prisma";

async function main() {
  const stage = await prisma.pipelineStage.updateMany({
    where: { summary: "34h scope approved by Jack Ross. EUR 5,440." },
    data: { summary: "34-credit scope approved by Jack Ross." },
  });
  const notif = await prisma.notification.updateMany({
    where: { body: "Approve Q3 App install campaign · 34h · EUR 5,440" },
    data: { body: "Approve Q3 App install campaign · 34 credits" },
  });
  console.log("Updated stages:", stage.count, "notifications:", notif.count);
}
main().finally(() => prisma.$disconnect());
