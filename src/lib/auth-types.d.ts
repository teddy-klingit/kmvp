import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "CLIENT" | "INTERNAL";
    } & DefaultSession["user"];
  }

  interface User {
    role: "CLIENT" | "INTERNAL";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "CLIENT" | "INTERNAL";
  }
}
