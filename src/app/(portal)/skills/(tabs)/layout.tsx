import { getPortalViewer } from "@/lib/current-viewer";
import { aiCreditStatus } from "@/lib/ai-credits";
import { PageHeader } from "@/components/ds/page-header";
import { CustomSkillRequest } from "@/components/portal/skills/custom-skill-request";
import { AiCreditMeter } from "@/components/portal/skills/ai-credit-meter";

const n = (v: number) => Math.round(v).toLocaleString("en-GB");

/** Skills (Phase R, design 02): All skills · Your custom skills. Templates now live in Visual identity and in a run. */
export default async function SkillsLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getPortalViewer();
  const ai = await aiCreditStatus(viewer.clientId);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Make it yourself, or let Klingit run it for you"
        title="Skills"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {!ai.ownModel && (
              <span className="flex h-11 items-center gap-3 rounded-full bg-white px-4 text-[14px]">
                <span className="w-20">
                  <AiCreditMeter used={ai.used} allowance={ai.used + ai.left} />
                </span>
                <span>
                  <b className="font-semibold">{n(ai.left)}</b> AI credits left
                </span>
              </span>
            )}
            <CustomSkillRequest />
          </div>
        }
        tabsLabel="Skills sections"
        tabs={[
          { label: "All skills", href: "/skills" },
          { label: "Your custom skills", href: "/skills/yours" },
        ]}
      />
      {children}
    </div>
  );
}
