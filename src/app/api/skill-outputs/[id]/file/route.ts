import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readUpload } from "@/lib/uploads";
import { fileResponse } from "@/lib/asset-files";

/** A skill output's file (a generated image) for the Output library: the client's own, or staff. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return new Response("Not found", { status: 404 });
  const output = await prisma.skillOutput.findUnique({ where: { id } });
  if (!output?.storageKey) return new Response("Not found", { status: 404 });
  if (session.user.role !== "INTERNAL") {
    const member = await prisma.clientUser.findUnique({ where: { userId: session.user.id }, select: { clientId: true } });
    if (member?.clientId !== output.clientId) return new Response("Not found", { status: 404 });
  }
  const data = await readUpload(output.storageKey);
  if (!data) return new Response("Not found", { status: 404 });
  return fileResponse(req, { data: new Uint8Array(data), mimeType: output.mimeType ?? "application/octet-stream", filename: "output" }, true);
}
