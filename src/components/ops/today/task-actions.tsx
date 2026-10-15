import { PillLink } from "@/components/ds/pill-link";
import type { Task } from "@/lib/today";

/** A task's one primary action and at most one secondary action. */
export function TaskActions({ task }: { task: Task }) {
  return (
    <span className="flex flex-wrap gap-2">
      {task.secondary && (
        <PillLink href={task.secondary.href} variant="secondary">
          {task.secondary.label}
        </PillLink>
      )}
      <PillLink href={task.primary.href} variant="primary">
        {task.primary.label}
      </PillLink>
    </span>
  );
}
