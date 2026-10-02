import { BrandOsHeader } from "@/components/portal/brand-os-header";

/** Brand OS: one header with Overview · Platform · Visual identity · Sources · Library · Agents. */
export default function BrandOsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <BrandOsHeader />
      {children}
    </div>
  );
}
