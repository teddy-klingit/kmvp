import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";

/** The opportunities the numbers on an Insights page produced (only this client's, only ones it can see). */
export function opportunityLinksFor(clientId: string, href: string) {
  return prisma.opportunity.findMany({ where: { clientId, hiddenAt: null, status: { not: "dismissed" }, insightHref: { startsWith: href } }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, title: true } });
}

/** Insights → Plan → Opportunities: when these numbers led to an opportunity, say so and link to it. */
export function OpportunityLinks({ rows }: { rows: { id: string; title: string }[] }) {
  if (!rows.length) return null;
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[12px] bg-white px-5 py-3 text-[14px]">
      <span className="flex items-center gap-1.5 text-brand-ink-2">
        <Sparkles className="size-4" strokeWidth={1.75} /> These numbers led to
      </span>
      {rows.map((o) => (
        <Link key={o.id} href={`/opportunities/${o.id}`} className="inline-flex items-center gap-1 text-brand-ink underline underline-offset-4">
          {o.title} <ArrowRight className="size-3.5" strokeWidth={1.75} />
        </Link>
      ))}
    </p>
  );
}
