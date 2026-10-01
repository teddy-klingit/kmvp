import { PageHeader } from "@/components/shared/page-header";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Account"
        tabs={[
          { label: "Overview", href: "/account" },
          { label: "Usage", href: "/account/usage" },
          { label: "Billing", href: "/account/billing" },
          { label: "Team", href: "/account/team" },
          { label: "Security", href: "/account/security" },
        ]}
      />
      {children}
    </div>
  );
}
