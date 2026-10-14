import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { roleTierFor } from "@/lib/role-tier";
import { exportInvoicesCsv } from "@/lib/invoicing";

/** Ops → Billing → CSV for accounting: invoices issued in a period (?from=YYYY-MM&to=YYYY-MM, to inclusive). Admins. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "INTERNAL") return new Response("Not found", { status: 404 });
  const staff = await prisma.staffMember.findUnique({ where: { userId: session.user.id } });
  if (!staff || roleTierFor(staff.title) !== "ADMIN") return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const month = (s: string | null) => (s && /^\d{4}-\d{2}$/.test(s) ? s.split("-").map(Number) : null);
  const f = month(url.searchParams.get("from")) ?? [new Date().getFullYear(), new Date().getMonth() + 1];
  const t = month(url.searchParams.get("to")) ?? f;
  const from = new Date(f[0], f[1] - 1, 1);
  const to = new Date(t[0], t[1], 1);
  const csv = await exportInvoicesCsv(from, to);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="klingit-invoices-${f.join("-")}_${t.join("-")}.csv"`, "Cache-Control": "no-store" } });
}
