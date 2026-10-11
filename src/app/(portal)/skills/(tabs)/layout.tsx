import { PageHeader } from "@/components/ds/page-header";
import { CustomSkillRequest } from "@/components/portal/skills/custom-skill-request";

/** Skills (nav v3): run one yourself, or have Klingit build one for you. Build pages have their own header. */
export default function SkillsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Run one yourself, or have Klingit build one for you"
        title="Skills"
        actions={<CustomSkillRequest />}
        tabsLabel="Skills sections"
        tabs={[
          { label: "Run a skill", href: "/skills" },
          { label: "Your skills", href: "/skills/yours" },
          { label: "Templates", href: "/skills/templates" },
        ]}
      />
      {children}
    </div>
  );
}
