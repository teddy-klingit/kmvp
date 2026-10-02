import { RouteChips } from "@/components/ds/route-chips";

/** Brand OS → Agents: Agents · Templates · Brand OS rules as filter chips (never a second tab bar). */
export default function AgentsTemplatesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <RouteChips
        label="Agents views"
        items={[
          { label: "Agents", href: "/assets/agents-templates", also: ["/assets/agents-templates/agent"] },
          { label: "Templates", href: "/assets/agents-templates/templates", also: ["/assets/agents-templates/templates", "/assets/templates"] },
          { label: "Brand OS rules", href: "/assets/agents-templates/brand-os" },
        ]}
      />
      {children}
    </div>
  );
}
