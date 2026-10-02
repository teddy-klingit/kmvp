/**
 * Brand OS details for Brief studio screenshots (the base seed has tone rules only): a persona, an imagery
 * style, colours and USPs, so the studio fills Audience and Tone & brand from Brand OS as in the design.
 * Fills empty fields only. Screenshot database only.
 *
 *   DATABASE_URL="file:./prisma/screens.db" npx tsx scripts/screenshots/seed-brief-studio.ts
 */
import { PrismaClient } from "../../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const klarna = await prisma.client.findFirstOrThrow({ where: { name: "Klarna" }, include: { brandOS: true } });
  const b = klarna.brandOS;
  const empty = (v: unknown) => v === null || v === undefined || (Array.isArray(v) && v.length === 0);
  await prisma.brandOS.upsert({
    where: { clientId: klarna.id },
    create: { clientId: klarna.id },
    update: {
      ...(empty(b?.audiencePersonas) ? { audiencePersonas: [{ name: "Mobile-first Maja", ageRange: "22–34", description: "Everyday smart spenders, 22–34, who shop on mobile and already know Klarna." }] } : {}),
      ...(!b?.imageryStyle ? { imageryStyle: "pink-first, bold type, real people shopping" } : {}),
      ...(empty(b?.colorPalette) ? { colorPalette: [{ name: "Klarna pink", hex: "#FFB3C7", role: "primary" }, { name: "Black", hex: "#17120F", role: "text" }] } : {}),
      ...(empty(b?.usps) ? { usps: ["Pay in 4, interest-free", "Shop now, pay later, no fees on time", "One app for every store"] } : {}),
    },
  });
  console.log("Klarna Brand OS ready for the Brief studio.");
}

main().finally(() => prisma.$disconnect());
