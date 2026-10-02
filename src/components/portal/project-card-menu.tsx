"use client";

import { MoreHorizontal, Copy, Pause, Play, Archive } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  duplicateProjectAction,
  pauseProjectAction,
  resumeProjectAction,
  deleteProjectAction,
} from "@/lib/actions/project-lifecycle-actions";

export function ProjectCardMenu({ projectId, status }: { projectId: string; status: string }) {
  const canPause = status !== "PAUSED" && status !== "ARCHIVED" && status !== "DELIVERED";
  const canDelete = status === "DRAFT" || status === "PAUSED" || status === "ARCHIVED";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-brand-ink-2 transition-colors hover:bg-brand-chip hover:text-brand-ink sm:size-8"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <form action={duplicateProjectAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <Copy className="size-3.5" />
              Duplicate
            </button>
          </DropdownMenuItem>
        </form>

        {status === "PAUSED" ? (
          <form action={resumeProjectAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                <Play className="size-3.5" />
                Resume
              </button>
            </DropdownMenuItem>
          </form>
        ) : (
          canPause && (
            <form action={pauseProjectAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <DropdownMenuItem asChild>
                <button type="submit" className="w-full">
                  <Pause className="size-3.5" />
                  Pause
                </button>
              </DropdownMenuItem>
            </form>
          )
        )}

        {canDelete && (
          <form
            action={deleteProjectAction}
            onSubmit={(e) => {
              if (!confirm("Archive this project? You'll find it under Archived.")) e.preventDefault();
            }}
          >
            <input type="hidden" name="projectId" value={projectId} />
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                <Archive className="size-3.5" />
                Archive
              </button>
            </DropdownMenuItem>
          </form>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
