import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { SettingsHeader } from "@/components/portal/settings-header";
import { pillClass } from "@/components/ds/button";
import { planFor } from "@/lib/ai-credits";
import { contractFor } from "@/lib/team-ledger";
import { prisma } from "@/lib/prisma";

/** Settings → Usage (admins: the whole account) or My usage (members: their own credits only). */
export default async function UsageLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getPortalViewer();
  const admin = isClientAdmin(viewer);
  // Phase S: on a contract, its platform plan; otherwise the old plan.
  const contract = await contractFor(viewer.clientId);
  const plan = (contract && (await prisma.platformPlan.findUnique({ where: { key: contract.platformPlanKey }, select: { name: true } }))) || (await planFor(viewer.client.planTier));
  const month = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date());
  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader
        eyebrow={admin ? `${month} · ${plan.name} plan · visible to admins` : `${month} · only your own credits`}
        title={admin ? "Usage" : "My usage"}
        actions={
          admin ? (
            <a href="/api/usage/export" className={pillClass("secondary")}>
              Export CSV
            </a>
          ) : undefined
        }
      />
      {children}
    </div>
  );
}
