import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

// Edge-safe auth instance (JWT read only, no Prisma adapter) — see auth.config.ts.
const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/sign-in", "/invite", "/forgot-password", "/reset-password"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const session = req.auth;

  if (isPublic) {
    if (session?.user && pathname === "/sign-in") {
      const home = session.user.role === "INTERNAL" ? "/ops" : "/dashboard";
      return NextResponse.redirect(new URL(home, req.url));
    }
    return NextResponse.next();
  }

  if (!session?.user) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  const isOpsPath = pathname.startsWith("/ops");
  if (isOpsPath && session.user.role !== "INTERNAL") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  if (!isOpsPath && pathname !== "/" && session.user.role !== "CLIENT") {
    return NextResponse.redirect(new URL("/ops", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|brand/).*)"],
};
