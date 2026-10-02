import { prisma } from "../src/lib/prisma";

async function main() {
  const client = await prisma.client.findFirst({ where: { slug: "klarna" } });
  if (!client) {
    console.log("no klarna client found by slug, listing all clients");
    console.log(await prisma.client.findMany({ select: { id: true, name: true, slug: true } }));
    return;
  }
  console.log("clientId", client.id);
  const assets = await prisma.brandAsset.findMany({ where: { clientId: client.id } });
  console.log("BrandAssets:", assets.length);
  console.log(assets.map((a) => ({ name: a.name, category: a.category, variant: a.variant })));
  const templates = await prisma.template.findMany({ where: { OR: [{ clientId: client.id }, { clientId: null }] } });
  console.log("Templates:", templates.length);
  console.log(templates.map((t) => ({ name: t.name, category: t.category, clientId: t.clientId })));
  const brandOS = await prisma.brandOS.findUnique({ where: { clientId: client.id } });
  console.log("BrandOS keys with data:", brandOS ? Object.keys(brandOS).filter((k) => (brandOS as Record<string, unknown>)[k] != null) : null);
}
main().finally(() => prisma.$disconnect());
