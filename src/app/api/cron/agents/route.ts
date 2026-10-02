import { NextResponse } from "next/server";
import { runScheduledAgents } from "@/lib/agent-scheduler";

/** Trigger the scheduled agent work on demand (e.g. an external cron). Needs CRON_SECRET as a bearer token. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const done = await runScheduledAgents();
  return NextResponse.json({ ok: true, done });
}
