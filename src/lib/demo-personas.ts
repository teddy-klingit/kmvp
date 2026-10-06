/**
 * Fixed set of seeded demo accounts this MVP can fast-switch between, so a
 * single showcase session can jump across the client view and all three
 * internal role tiers without separate logins. All seeded users share the
 * same demo password — see prisma/seed.ts.
 */
export const DEMO_PERSONAS = [
  {
    key: "client",
    email: "jack.ross@klarna.com",
    name: "Jack Ross",
    subtitle: "Client — Klarna",
    homeHref: "/dashboard",
  },
  {
    key: "spotify",
    email: "demo@lifeatspotify.com",
    name: "Life at Spotify",
    subtitle: "Client — Spotify (RFP demo)",
    homeHref: "/dashboard",
  },
  {
    key: "ouhers",
    email: "maja@ouhers.demo",
    name: "Maja Lind",
    subtitle: "Client — ouhers (demo account)",
    homeHref: "/dashboard",
  },
  {
    key: "pm",
    email: "teddy@klingit.com",
    name: "Teddy W.",
    subtitle: "Internal — Project Manager",
    homeHref: "/ops",
  },
  {
    key: "creator",
    email: "sara.n@klingit.com",
    name: "Sara N.",
    subtitle: "Internal — Creator",
    homeHref: "/ops",
  },
  {
    key: "admin",
    email: "admin@klingit.com",
    name: "Admin",
    subtitle: "Internal — Admin",
    homeHref: "/ops",
  },
] as const;

export type DemoPersonaKey = (typeof DEMO_PERSONAS)[number]["key"];

export const DEMO_PASSWORD = "klingit-demo";
