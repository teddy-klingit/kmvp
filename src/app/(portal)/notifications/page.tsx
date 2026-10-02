import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { PageHeader } from "@/components/shared/page-header";
import { FilterChips } from "@/components/ds/filter-chips";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "action", label: "Action needed" },
  { key: "delivery", label: "Deliveries" },
  { key: "update", label: "Updates" },
  { key: "account", label: "Account" },
] as const;

const TYPE_TO_FILTER: Record<string, (typeof FILTERS)[number]["key"]> = {
  APPROVAL_NEEDED: "action",
  SYSTEM: "action",
  DELIVERY_READY: "delivery",
  COMMENT: "update",
  AGENT_FAILURE: "update",
  SLA_BREACH: "account",
};

const TYPE_BADGE: Record<string, { label: string; tone: "danger" | "info" | "success" | "warning" | "neutral" }> = {
  APPROVAL_NEEDED: { label: "Action needed", tone: "danger" },
  SYSTEM: { label: "Action needed", tone: "warning" },
  DELIVERY_READY: { label: "Delivery", tone: "info" },
  COMMENT: { label: "Update", tone: "success" },
  AGENT_FAILURE: { label: "Update", tone: "success" },
  SLA_BREACH: { label: "Account", tone: "neutral" },
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "all" } = await searchParams;
  const viewer = await getPortalViewer();

  const notifications = await prisma.notification.findMany({
    where: { userId: viewer.userId, archivedAt: null },
    orderBy: { createdAt: "desc" },
  });

  const unreadCount = notifications.filter((n) => !n.read).length;
  const filtered = filter === "all" ? notifications : notifications.filter((n) => TYPE_TO_FILTER[n.type] === filter);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={unreadCount > 0 ? `${unreadCount} unread` : "All read"} title="Notifications" />
      <FilterChips label="Filter notifications" items={FILTERS.map((f) => ({ label: f.label, href: f.key === "all" ? "/notifications" : `/notifications?filter=${f.key}`, active: filter === f.key }))} />

      <div className="flex flex-col gap-3">
        {filtered.length === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">Nothing here yet.</p>
          </Card>
        ) : (
          filtered.map((n) => {
            const badge = TYPE_BADGE[n.type];
            return (
              <Card
                key={n.id}
                className={`flex items-center justify-between gap-4 p-5 ${
                  badge.tone === "danger" || badge.tone === "warning" ? "border-l-4" : ""
                } ${badge.tone === "danger" ? "border-l-danger" : badge.tone === "warning" ? "border-l-accent" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                  <div>
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-sm text-muted-foreground">{n.body}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <p className="text-xs text-muted-foreground">
                    {formatDate(n.createdAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  {n.actionUrl && n.actionLabel && (
                    <Button asChild size="sm" variant="secondary">
                      <Link href={n.actionUrl}>{n.actionLabel}</Link>
                    </Button>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
