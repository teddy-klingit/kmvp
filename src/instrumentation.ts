/**
 * Runs once when the server starts. In production it starts the hourly agent scheduler (Insights takeaways,
 * weekly and monthly reports). AGENT_SCHEDULER=0 turns it off.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production" || process.env.AGENT_SCHEDULER === "0") return;
  const { startAgentScheduler } = await import("@/lib/agent-scheduler");
  startAgentScheduler();
}
