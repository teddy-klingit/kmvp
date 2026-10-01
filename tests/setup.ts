import { vi } from "vitest";

// Must happen before anything imports "@/lib/prisma" — tests run against a
// dedicated SQLite file, migrated once via:
//   DATABASE_URL="file:./prisma/test.db" npx prisma migrate deploy
process.env.DATABASE_URL = "file:./prisma/test.db";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

// Pages are rendered to static HTML in tests, outside the Next.js router.
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ href, children, prefetch: _prefetch, ...rest }: { href: string; children?: unknown; prefetch?: unknown }) =>
      createElement("a", { href, ...rest }, children as never),
  };
});

type MockSession = { user: { id: string; role: "CLIENT" | "INTERNAL" } } | null;

const authMocks = vi.hoisted(() => ({
  session: null as MockSession,
  signIn: vi.fn(),
}));
export { authMocks };

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => authMocks.session),
  signIn: authMocks.signIn,
  signOut: vi.fn(),
}));

/** Point the next auth()/signIn() call at a given session for this test. */
export function setMockSession(session: MockSession) {
  authMocks.session = session;
  authMocks.signIn.mockClear();
}
