import { PageTransition } from "@/components/shared/page-transition";

/**
 * A section with its own menu (Phase X: Insights; Brand OS and other deep sections can use it too). The main nav
 * folds to the icon strip (AppNav `sectionPrefixes`); beside it sits the section's full-height menu, a shade
 * darker than the page, and the content gets the rest of the width. On phones the menu is hidden and `chips`
 * (a scrollable row) take its place above the content.
 */
export function SectionShell({ menu, chips, children }: { menu: React.ReactNode; chips?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col overflow-y-auto border-r border-brand-rule bg-[#F3EEE3] px-3.5 pb-5 pt-7 print:!hidden min-[900px]:flex">{menu}</aside>
      <div className="min-w-0 flex-1 px-4 pb-12 pt-5 min-[900px]:px-10 min-[900px]:pb-14 min-[900px]:pt-8">
        {chips && <div className="-mx-4 mb-5 print:hidden min-[900px]:hidden">{chips}</div>}
        <div className="mx-auto w-full max-w-[1060px]">
          <PageTransition>{children}</PageTransition>
        </div>
      </div>
    </div>
  );
}
