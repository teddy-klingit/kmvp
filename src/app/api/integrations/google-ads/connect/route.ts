import { NextRequest, NextResponse } from "next/server";
import { requireOpsRole } from "@/lib/authz";
import { issueOAuthState } from "@/lib/oauth-state";

export async function GET(req: NextRequest) {
  await requireOpsRole(["ADMIN"]);
  const appUrl = process.env.APP_URL ?? req.nextUrl.origin;
  const redirectUri = `${appUrl}/api/integrations/google-ads/callback`;

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/adwords",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return issueOAuthState(NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`), "google-ads", state);
}
