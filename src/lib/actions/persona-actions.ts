"use server";

import { auth, signIn } from "@/lib/auth";
import { DEMO_PERSONAS, DEMO_PASSWORD, type DemoPersonaKey } from "@/lib/demo-personas";

/** Demo-only fast switch between the seeded personas (they share one demo
 * password), so anyone walking through the MVP can hop between the client
 * view and the internal role tiers without separate logins. Requires an
 * existing session so logged-out visitors can't use it. */
export async function switchPersonaAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) return;

  const key = String(formData.get("persona") ?? "") as DemoPersonaKey;
  const persona = DEMO_PERSONAS.find((p) => p.key === key);
  if (!persona) return;

  await signIn("credentials", {
    email: persona.email,
    password: DEMO_PASSWORD,
    redirectTo: persona.homeHref,
  });
}
