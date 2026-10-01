import { NextRequest, NextResponse } from "next/server";
import { requireOpsRole } from "@/lib/authz";

export async function GET(req: NextRequest) {
  await requireOpsRole(["ADMIN"]);

  const appUrl = process.env.APP_URL ?? req.nextUrl.origin;
  const redirectUri = `${appUrl}/api/integrations/linkedin/callback`;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    scope: "r_ads r_ads_reporting",
    state: crypto.randomUUID(),
  });

  return NextResponse.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`);
}
