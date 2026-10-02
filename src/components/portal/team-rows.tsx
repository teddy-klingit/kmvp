import { prisma } from "@/lib/prisma";
import { CLIENT_PERMISSION_LABEL } from "@/lib/labels";
import { removeTeammateAction } from "@/lib/actions/team-actions";
import { Avatar } from "@/components/ds/avatar";
import { CardRows } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { pillClass } from "@/components/ds/button";

/** The client's team with permission pills (Owner / Approver / Viewer, or Invited). Owners can remove others when `manage` is on. */
export async function TeamRows({ clientId, viewer, manage = false }: { clientId: string; viewer: { id: string; permission: string }; manage?: boolean }) {
  const team = await prisma.clientUser.findMany({ where: { clientId }, include: { user: true }, orderBy: { createdAt: "asc" } });
  return (
    <CardRows>
      {team.map((t) => (
        <li key={t.id} className="flex items-center gap-3 px-6 py-4">
          <Avatar name={t.user.name} size={32} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[16px]">{t.user.name}</span>
            <span className="truncate text-[13px] text-brand-ink-2">{t.jobTitle ?? t.user.email}</span>
          </span>
          <StatusPill tone={t.user.status === "INVITED" ? "watch" : "neutral"}>{t.user.status === "INVITED" ? "Invited" : CLIENT_PERMISSION_LABEL[t.permission]}</StatusPill>
          {manage && viewer.permission === "OWNER" && t.id !== viewer.id && (
            <form action={removeTeammateAction}>
              <input type="hidden" name="clientUserId" value={t.id} />
              <button type="submit" className={pillClass("secondary", "sm")}>
                Remove
              </button>
            </form>
          )}
        </li>
      ))}
    </CardRows>
  );
}
