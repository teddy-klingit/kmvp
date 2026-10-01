import { after } from "next/server";
import { runAutopilot, runAutopilotForActiveProjects } from "@/lib/autopilot-runner";

/**
 * Page-load autopilot checks (approved for the MVP; TODO(cron) in autopilot-runner.ts).
 * Scheduled with after() so a slow agent call never delays the page; outside a request
 * (render tests, scripts) there's nothing to schedule into, so it's skipped.
 */
export function scheduleAutopilot(projectId?: string) {
  // Screenshot runs freeze the demo data so captures are deterministic.
  if (process.env.AUTOPILOT_ON_PAGE_LOAD === "0") return;
  try {
    after(async () => {
      try {
        if (projectId) await runAutopilot(projectId);
        else await runAutopilotForActiveProjects();
      } catch (err) {
        console.error("autopilot check failed", err);
      }
    });
  } catch {
    // No request scope.
  }
}
