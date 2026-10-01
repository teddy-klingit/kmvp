import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { PageHeader } from "@/components/shared/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { PersonAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const FAQS = [
  { q: "How does the AI brief agent work?", a: "It parses your answers, cross-checks them against your brand OS, and flags any gaps before production starts." },
  { q: "What happens if I don't approve an estimate?", a: "You can request changes instead — your account lead will revise the scope and resend it." },
  { q: "How is my brand OS kept up to date?", a: "Every delivered project feeds learnings back into your Brand OS automatically via the Learning agent." },
  { q: "Can I add more teammates?", a: "Yes — invite them from Account > Team with the right approval permission." },
];

export default async function HelpPage() {
  const viewer = await getPortalViewer();
  const client = await prisma.client.findUnique({ where: { id: viewer.clientId }, include: { accountLead: { include: { user: true } } } });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Help & support" actions={<div />} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <SectionLabel>Your account lead</SectionLabel>
          <Card className="flex items-center justify-between gap-4 p-5">
            {client?.accountLead && (
              <div className="flex items-center gap-3">
                <PersonAvatar name={client.accountLead.user.name} />
                <div>
                  <p className="text-sm font-semibold">{client.accountLead.user.name}</p>
                  <p className="text-sm text-muted-foreground">{client.accountLead.user.email}</p>
                </div>
              </div>
            )}
            <Button variant="secondary" size="sm">
              Schedule a call
            </Button>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Send a message</SectionLabel>
          <Card className="flex flex-col gap-3 p-5">
            <Textarea placeholder="How can we help?" className="min-h-24" />
            <Button className="self-start">Send</Button>
          </Card>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel>Frequently asked questions</SectionLabel>
        <Card className="divide-y divide-border p-0">
          {FAQS.map((f) => (
            <div key={f.q} className="px-5 py-4">
              <p className="text-sm font-semibold">{f.q}</p>
              <p className="text-sm text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
