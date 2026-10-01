import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InspirationExploreButton } from "@/components/portal/inspiration-explore-button";
import { jsonArray } from "@/lib/utils";

export default async function ProjectInspirationPage() {
  const viewer = await getPortalViewer();
  const inspirations = await prisma.inspiration.findMany({
    where: { clientId: viewer.clientId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Project Inspiration"
        tabs={[
          { label: "All projects", href: "/projects" },
          { label: "Inspiration", href: "/projects/inspiration" },
        ]}
      />
      <div>
        <h2 className="text-lg font-semibold">Project inspiration</h2>
        <p className="text-sm text-muted-foreground">
          Opportunities our team thinks are right for {viewer.client.name} right now — based on your market,
          seasonality and brand context.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {inspirations.map((idea, i) => (
          <Card
            key={idea.id}
            className="flex animate-in fade-in slide-in-from-bottom-1 flex-col gap-3 p-5 duration-300"
            style={{ animationDelay: `${Math.min(i, 8) * 50}ms`, animationFillMode: "backwards" }}
          >
            <div>
              <p className="text-sm font-semibold">{idea.title}</p>
              <p className="text-sm text-muted-foreground">{idea.description}</p>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                {jsonArray<string>(idea.formatTags).map((tag) => (
                  <Badge key={tag} tone="info">
                    {tag}
                  </Badge>
                ))}
              </div>
              <InspirationExploreButton inspirationId={idea.id} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
