import type { NextRequest, NextResponse } from "next/server";

/**
 * OAuth `state` for the staff ad-account connections (Google Ads, LinkedIn): a random value set in a short-lived,
 * http-only cookie on the way out and checked on the way back, so a callback that Klingit didn't start (CSRF) is
 * refused before any token is asked for.
 */
const cookieName = (provider: string) => `oauth_state_${provider.replace(/[^a-z]/gi, "")}`;

export function issueOAuthState(res: NextResponse, provider: string, state: string) {
  res.cookies.set(cookieName(provider), state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/api/integrations" });
  return res;
}

/** True only when the callback's state matches the one this browser was sent off with. */
export function oauthStateMatches(req: NextRequest, provider: string) {
  const sent = req.cookies.get(cookieName(provider))?.value;
  const back = req.nextUrl.searchParams.get("state");
  return Boolean(sent && back && sent === back);
}

export function clearOAuthState(res: NextResponse, provider: string) {
  res.cookies.delete({ name: cookieName(provider), path: "/api/integrations" });
  return res;
}
