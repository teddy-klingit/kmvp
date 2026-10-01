import { NavTabs } from "@/components/ui/nav-tabs";

export default function AgentsTemplatesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <NavTabs
        size="sm"
        items={[
          { label: "Agents", href: "/assets/agents-templates" },
          { label: "Templates", href: "/assets/agents-templates/templates" },
          { label: "Brand OS", href: "/assets/agents-templates/brand-os" },
        ]}
      />
      {children}
    </div>
  );
}
