import Link from "next/link";
import { Lock, Globe, Crown } from "lucide-react";
import { prisma } from "@/lib/prisma";
import type { PortalViewer } from "@/lib/brief-intake";
import { projectVisibilityWhere, canManageProjectAccess } from "@/lib/project-visibility";
import { Card, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PersonAvatar } from "@/components/ui/avatar";
import {
  addProjectMemberAction,
  removeProjectMemberAction,
  setProjectConfidentialAction,
} from "@/lib/actions/project-access-actions";

/** Who can see the project, adding teammates, confidentiality — shown in the header's Share modal. */
export async function ProjectAccessPanel({ projectId, viewer }: { projectId: string; viewer: PortalViewer }) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, clientId: viewer.clientId, ...projectVisibilityWhere(viewer.id) },
    include: {
      createdBy: { include: { user: true } },
      members: { include: { clientUser: { include: { user: true } } }, orderBy: { addedAt: "asc" } },
    },
  });
  if (!project) return null;

  const isCreator = canManageProjectAccess(project, viewer.id);
  const memberIds = new Set(project.members.map((m) => m.clientUserId));
  if (project.createdByClientUserId) memberIds.add(project.createdByClientUserId);

  const invitable = isCreator
    ? await prisma.clientUser.findMany({
        where: { clientId: viewer.clientId, id: { notIn: Array.from(memberIds) } },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      })
    : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <SectionLabel>Who has access</SectionLabel>
        <Card className="divide-y divide-border p-0">
          {project.createdBy && (
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex items-center gap-3">
                <PersonAvatar name={project.createdBy.user.name} size="sm" />
                <div>
                  <p className="text-sm font-medium">{project.createdBy.user.name}</p>
                  <p className="text-xs text-muted-foreground">{project.createdBy.jobTitle ?? project.createdBy.user.email}</p>
                </div>
              </div>
              <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Crown className="size-3.5" />
                Creator
              </span>
            </div>
          )}
          {project.members.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex items-center gap-3">
                <PersonAvatar name={m.clientUser.user.name} size="sm" />
                <div>
                  <p className="text-sm font-medium">{m.clientUser.user.name}</p>
                  <p className="text-xs text-muted-foreground">{m.clientUser.jobTitle ?? m.clientUser.user.email}</p>
                </div>
              </div>
              {isCreator && (
                <form action={removeProjectMemberAction}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="clientUserId" value={m.clientUserId} />
                  <Button type="submit" size="sm" variant="ghost">
                    Remove
                  </Button>
                </form>
              )}
            </div>
          ))}
          {project.members.length === 0 && (
            <p className="px-4 py-3 text-xs text-muted-foreground">
              {project.confidential
                ? "No one else has been added yet — this project is confidential, so only the creator can see it."
                : "No one else has been added yet — everyone on your team can already see this project."}
            </p>
          )}
        </Card>
      </div>

      {isCreator && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Add a teammate</SectionLabel>
          {invitable.length > 0 ? (
            <form action={addProjectMemberAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="share-clientUserId" className="sr-only">
                  Teammate
                </Label>
                <select
                  id="share-clientUserId"
                  name="clientUserId"
                  className="h-9 rounded-md border border-input bg-card px-3 text-sm"
                  defaultValue={invitable[0].id}
                >
                  {invitable.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.user.name} — {t.jobTitle ?? t.user.email}
                    </option>
                  ))}
                </select>
              </div>
              <input type="hidden" name="projectId" value={project.id} />
              <Button type="submit">Add</Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">Everyone on your team already has access.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Someone not on Klingit yet?{" "}
            <Link href="/account/team" className="text-primary hover:underline">
              Invite them to your team
            </Link>{" "}
            first.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <SectionLabel>Confidentiality</SectionLabel>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {project.confidential ? (
              <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            ) : (
              <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <div>
              <p className="text-sm font-medium">
                {project.confidential ? "Confidential — creator and added people only" : "Visible to your whole team"}
              </p>
              <p className="text-xs text-muted-foreground">
                {project.confidential
                  ? "Other teammates won't see it in their boards, dashboard or search. Klingit can always see it."
                  : "Make it confidential to limit it to the people above."}
              </p>
            </div>
          </div>
          {isCreator && (
            <form action={setProjectConfidentialAction} className="shrink-0">
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="confidential" value={project.confidential ? "false" : "true"} />
              <Button type="submit" size="sm" variant={project.confidential ? "outline" : "primary"}>
                {project.confidential ? "Make visible" : "Make confidential"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
