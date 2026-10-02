import { Lightbulb } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { jsonArray } from "@/lib/utils";
import { PageHeader } from "@/components/ds/page-header";
import { SectionCard, CardRows, CardNote } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { EmptyState } from "@/components/ds/empty-state";
import { InspirationExploreButton } from "@/components/portal/inspiration-explore-button";

/** Project inspiration: ideas the team thinks fit this client now. Reached from Projects (no tabs of its own). */
export default async function ProjectInspirationPage() {
  const viewer = await getPortalViewer();
  const inspirations = await prisma.inspiration.findMany({
    where: { clientId: viewer.clientId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/projects", label: "Projects" }}
        eyebrow={inspirations.length > 0 ? `${inspirations.length} idea${inspirations.length === 1 ? "" : "s"} for ${viewer.client.name}` : `Ideas for ${viewer.client.name}`}
        title="Project inspiration"
      />

      {inspirations.length === 0 ? (
        <EmptyState icon={Lightbulb} title="No ideas yet. Your team will add some here." />
      ) : (
        <SectionCard title="Ideas for right now">
          <CardNote className="border-b border-brand-line">
            Opportunities our team thinks are right for {viewer.client.name} right now — based on your market, seasonality and brand context.
          </CardNote>
          <CardRows>
            {inspirations.map((idea, i) => {
              const tags = jsonArray<string>(idea.formatTags);
              return (
                <li
                  key={idea.id}
                  className="flex animate-in fade-in slide-in-from-bottom-1 flex-wrap items-start gap-x-6 gap-y-3 px-6 py-5 duration-300"
                  style={{ animationDelay: `${Math.min(i, 8) * 50}ms`, animationFillMode: "backwards" }}
                >
                  <div className="flex min-w-[min(100%,260px)] flex-1 flex-col gap-1.5">
                    <span className="text-[16px] text-brand-ink">{idea.title}</span>
                    <span className="text-[14px] text-brand-ink-2">{idea.description}</span>
                    {tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {tags.map((tag) => (
                          <StatusPill key={tag} tone="neutral">
                            {tag}
                          </StatusPill>
                        ))}
                      </div>
                    )}
                  </div>
                  <InspirationExploreButton inspirationId={idea.id} />
                </li>
              );
            })}
          </CardRows>
        </SectionCard>
      )}
    </div>
  );
}
