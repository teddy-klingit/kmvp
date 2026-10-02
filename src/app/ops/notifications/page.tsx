import Link from "next/link";
import { Bell } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getOpsViewer } from "@/lib/current-viewer";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { SectionCard, CardRows } from "@/components/ds/card";
import { EmptyState } from "@/components/ds/empty-state";
import { PillLink } from "@/components/ds/pill-link";
import { formatDate } from "@/lib/utils";

/** Ops notifications: the signed-in staff member's own notifications, newest first (archived ones hidden). */
export default async function OpsNotificationsPage() {
  const viewer = await getOpsViewer();
  const notifications = await prisma.notification.findMany({ where: { userId: viewer.user.id, archivedAt: null }, orderBy: { createdAt: "desc" }, take: 50 });
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <OpsPage>
      <PageHeader eyebrow={unread ? `${unread} UNREAD` : "ALL READ"} title="Notifications" />
      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications yet." action={<PillLink href="/ops">Go to Needs you</PillLink>} />
      ) : (
        <SectionCard title="Latest">
          <CardRows>
            {notifications.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
                <span aria-hidden className={n.read ? "size-2 shrink-0 rounded-full bg-brand-line" : "size-2 shrink-0 rounded-full bg-brand-orange"} />
                <span className="flex min-w-0 flex-1 basis-[240px] flex-col gap-0.5">
                  <span className="text-[15px]">{n.title}</span>
                  <span className="text-[13px] text-brand-ink-2">{n.body}</span>
                </span>
                <span className="text-[12px] text-brand-mute">{formatDate(n.createdAt, { day: "numeric", month: "short" })}</span>
                {n.actionUrl && (
                  <Link href={n.actionUrl} className="font-brand-mono text-[12px] text-brand-ink underline underline-offset-4">
                    {(n.actionLabel ?? "Open").toUpperCase()}
                  </Link>
                )}
              </li>
            ))}
          </CardRows>
        </SectionCard>
      )}
    </OpsPage>
  );
}
