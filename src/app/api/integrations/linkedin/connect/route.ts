import { NextRequest, NextResponse } from "next/server";
import { requireOpsRole } from "@/lib/authz";
import { issueOAuthState } from "@/lib/oauth-state";

export async function GET(req: NextRequest) {
  await requireOpsRole(["ADMIN"]);

  const appUrl = process.env.APP_URL ?? req.nextUrl.origin;
  const redirectUri = `${appUrl}/api/integrations/linkedin/callback`;
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    scope: "r_ads r_ads_reporting",
    state,
  });

  return issueOAuthState(NextResponse.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`), "linkedin", state);
}
