import { PageHeader } from "@/components/ds/page-header";

/** Output library (nav v3): everything Klingit and your skills have made. */
export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Everything Klingit and your skills have made" title="Output library" />
      {children}
    </div>
  );
}
