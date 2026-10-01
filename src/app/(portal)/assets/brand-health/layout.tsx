import { NavTabs } from "@/components/ui/nav-tabs";

export default function BrandHealthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Brand health</h2>
        <p className="text-sm text-muted-foreground">
          How complete and consistent your brand is in the Klingit system.
        </p>
      </div>
      <NavTabs
        size="sm"
        items={[
          { label: "Overview", href: "/assets/brand-health" },
          { label: "Assets", href: "/assets/brand-health/assets" },
          { label: "Gaps", href: "/assets/brand-health/gaps" },
        ]}
      />
      {children}
    </div>
  );
}
