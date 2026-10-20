import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSecurityFixtures } from "./fixtures";
import { setMockSession } from "./setup";
import { GET as connectGoogle } from "@/app/api/integrations/google-ads/connect/route";
import { GET as callbackGoogle } from "@/app/api/integrations/google-ads/callback/route";
import { GET as callbackLinkedIn } from "@/app/api/integrations/linkedin/callback/route";

/** Phase V (from the V0 findings): the staff OAuth callbacks check `state`, so a callback Klingit didn't start is refused. */
let fx: Awaited<ReturnType<typeof createSecurityFixtures>>;
beforeAll(async () => {
  fx = await createSecurityFixtures();
  setMockSession({ user: { id: fx.adminUser.id, role: "INTERNAL" } });
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await fx.cleanup();
});

describe("OAuth state", () => {
  it("connect sends a state and keeps it in a short-lived cookie; a callback without it never asks for a token", async () => {
    const res = await connectGoogle(new NextRequest("http://app.test/api/integrations/google-ads/connect"));
    const state = new URL(res.headers.get("location")!).searchParams.get("state")!;
    expect(state).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.cookies.get("oauth_state_googleads")?.value).toBe(state);

    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ error: "nope" }), { status: 400 }));
    vi.stubGlobal("fetch", fetchSpy);
    for (const [cb, name] of [[callbackGoogle, "google-ads"], [callbackLinkedIn, "linkedin"]] as const) {
      const forged = await cb(new NextRequest(`http://app.test/api/integrations/${name}/callback?code=abc&state=forged`, { headers: { cookie: `oauth_state_${name.replace("-", "")}=${state}` } }));
      expect(forged.headers.get("location")).toMatch(/error/);
      const none = await cb(new NextRequest(`http://app.test/api/integrations/${name}/callback?code=abc&state=${state}`));
      expect(none.headers.get("location")).toMatch(/error/);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    // With the matching cookie the token exchange is attempted.
    await callbackGoogle(new NextRequest(`http://app.test/api/integrations/google-ads/callback?code=abc&state=${state}`, { headers: { cookie: `oauth_state_googleads=${state}` } }));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
