import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOpsRole } from "@/lib/authz";

export async function GET(req: NextRequest) {
  await requireOpsRole(["ADMIN"]);

  const appUrl = process.env.APP_URL ?? req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  const errorParam = req.nextUrl.searchParams.get("error");
  const settingsUrl = new URL("/ops/settings", appUrl);

  if (errorParam || !code) {
    settingsUrl.searchParams.set("google", "error");
    return NextResponse.redirect(settingsUrl);
  }

  const redirectUri = `${appUrl}/api/integrations/google-ads/callback`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: process.env.GOOGLE_ADS_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? "",
    }),
  });

  const data = await tokenRes.json();

  if (!tokenRes.ok || !data.access_token) {
    settingsUrl.searchParams.set("google", "error");
    return NextResponse.redirect(settingsUrl);
  }

  await prisma.integrationConnection.upsert({
    where: { provider: "google-ads" },
    update: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? undefined, // Google only returns a refresh_token on first consent — keep the existing one on reconnect
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
    create: {
      provider: "google-ads",
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
  });

  settingsUrl.searchParams.set("google", "connected");
  return NextResponse.redirect(settingsUrl);
}
