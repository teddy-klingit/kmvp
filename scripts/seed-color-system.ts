import { prisma } from "../src/lib/prisma";

async function main() {
  const client = await prisma.client.findFirstOrThrow({ where: { slug: "klarna" } });

  await prisma.brandOS.update({
    where: { clientId: client.id },
    data: {
      colorPalette: [
        { hex: "#FFB3C7", name: "Klarna Pink", role: "primary" },
        { hex: "#0A0A0A", name: "Ink Black", role: "primary" },
        { hex: "#FFFFFF", name: "Pure White", role: "primary" },
        { hex: "#FFE8EF", name: "Blush Tint", role: "secondary" },
        { hex: "#7A6FF0", name: "Signal Purple", role: "secondary" },
        { hex: "#0FA97A", name: "Confirm Green", role: "secondary" },
      ],
      colorGradients: [
        { name: "Pink Fade", from: "#FFB3C7", to: "#FFE8EF" },
        { name: "Pink to Purple", from: "#FFB3C7", to: "#7A6FF0" },
      ],
    },
  });

  console.log("Colour system seeded for", client.name);
}

main().finally(() => prisma.$disconnect());
