import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { PageHeader } from "@/components/ds/page-header";
import { PageGrid } from "@/components/ds/page-grid";
import { SectionCard, CardRows } from "@/components/ds/card";
import { Avatar } from "@/components/ds/avatar";
import { Button } from "@/components/ds/button";
import { Textarea } from "@/components/ui/textarea";

const FAQS = [
  { q: "How does the AI brief agent work?", a: "It parses your answers, cross-checks them against your brand OS, and flags any gaps before production starts." },
  { q: "What happens if I don't approve an estimate?", a: "You can request changes instead — your account lead will revise the scope and resend it." },
  { q: "How is my brand OS kept up to date?", a: "Every delivered project feeds learnings back into your Brand OS automatically via the Learning agent." },
  { q: "Can I add more teammates?", a: "Yes — invite them from Account > Team with the right approval permission." },
];

/** Help & support: FAQs, the account lead and a message box. Linked from Account. */
export default async function HelpPage() {
  const viewer = await getPortalViewer();
  const client = await prisma.client.findUnique({ where: { id: viewer.clientId }, include: { accountLead: { include: { user: true } } } });
  const lead = client?.accountLead?.user;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={{ href: "/account", label: "Account" }} eyebrow="Support" title="Help & support" />

      <PageGrid
        main={
          <SectionCard title="Frequently asked questions">
            <CardRows>
              {FAQS.map((f) => (
                <li key={f.q} className="flex flex-col gap-1 px-6 py-4">
                  <span className="text-[15px] text-brand-ink">{f.q}</span>
                  <span className="text-[14px] text-brand-ink-2">{f.a}</span>
                </li>
              ))}
            </CardRows>
          </SectionCard>
        }
        side={
          <>
            <SectionCard title="Your account lead">
              <div className="flex flex-col gap-4 px-6 py-5">
                {lead && (
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={lead.name} size={36} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[15px]">{lead.name}</span>
                      <span className="truncate text-[13px] text-brand-ink-2">{lead.email}</span>
                    </div>
                  </div>
                )}
                <Button variant="secondary" size="sm" className="self-start">
                  Schedule a call
                </Button>
              </div>
            </SectionCard>
            <SectionCard title="Send a message">
              <div className="flex flex-col gap-3 px-6 py-5">
                <Textarea placeholder="How can we help?" className="min-h-24" aria-label="Your message" />
                <Button variant="primary" className="self-start">
                  Send
                </Button>
              </div>
            </SectionCard>
          </>
        }
      />
    </div>
  );
}
