import { PageHeader } from "@/components/ds/page-header";

/** Skills (nav v3): run one yourself, or have Klingit build one for you. */
export default function SkillsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Run one yourself, or have Klingit build one for you"
        title="Skills"
        tabsLabel="Skills sections"
        tabs={[
          { label: "Run a skill", href: "/skills" },
          { label: "Templates", href: "/skills/templates" },
        ]}
      />
      {children}
    </div>
  );
}
