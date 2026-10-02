import { Plus } from "lucide-react";
import type { NavTabItem } from "@/components/ui/nav-tabs";
import { PageHeader as DsPageHeader } from "@/components/ds/page-header";
import { PillLink } from "@/components/ds/pill-link";

/**
 * Older call sites' header, now drawn by the ds PageHeader (mono eyebrow, 36px weight-300 title, actions on
 * the right, one pill SegmentedNav). New pages should import components/ds/page-header directly.
 * `addHref` renders a "+ New" pill when a page passes one; there's no header search box any more.
 */
function PageHeader({
  title,
  eyebrow,
  breadcrumb,
  tabs,
  actions,
  addHref,
  addLabel = "New",
  className,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  breadcrumb?: { label: string; href: string };
  tabs?: NavTabItem[];
  actions?: React.ReactNode;
  addHref?: string;
  addLabel?: string;
  className?: string;
}) {
  const fallback = addHref ? (
    <PillLink href={addHref} variant="primary">
      <Plus className="size-3.5" strokeWidth={1.75} />
      {addLabel}
    </PillLink>
  ) : null;
  return <DsPageHeader title={title} eyebrow={eyebrow} back={breadcrumb} tabs={tabs} actions={actions ?? fallback} className={className} />;
}

export { PageHeader };
