import { BrandOsHeader } from "@/components/portal/brand-os-header";
import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";

/** Brand OS: one header with Overview · Platform · Visual identity · Rules. */
export default async function BrandOsLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getPortalViewer();
  return (
    <div className="flex flex-col gap-6">
      <BrandOsHeader admin={isClientAdmin(viewer)} />
      {children}
    </div>
  );
}
