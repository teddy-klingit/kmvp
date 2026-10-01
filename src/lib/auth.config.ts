import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe base config (no Prisma adapter, no bcrypt/Credentials provider —
 * those touch Node-only APIs). Used directly by middleware, and extended
 * with the adapter + provider in `auth.ts` for server components/routes.
 */
export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/sign-in",
  },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.role = (user as { role: "CLIENT" | "INTERNAL" }).role;
        token.id = user.id as string;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "CLIENT" | "INTERNAL";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
