import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { AskAnythingSection } from "@/components/portal/ask-anything-section";

export default async function InsightsLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getPortalViewer();
  const questions = await prisma.marketIntelligenceQuestion.findMany({
    where: { clientId: viewer.clientId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return (
    <div className="pb-24">
      {children}
      <AskAnythingSection questions={questions} />
    </div>
  );
}
