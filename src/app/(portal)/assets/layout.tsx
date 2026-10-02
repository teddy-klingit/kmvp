import { BrandIqHeader } from "@/components/portal/brand-iq-header";

/** Brand IQ: one header with Overview · Platform · Visual identity · Sources · Library · Agents. */
export default function BrandIqLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <BrandIqHeader />
      {children}
    </div>
  );
}
