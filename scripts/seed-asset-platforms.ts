import { prisma } from "../src/lib/prisma";

const PLATFORM_BY_ID: Record<string, string> = {
  cmt3ypa290024s9tx7039gy8p: "TikTok",
  cmt3ypa290026s9txd5ctn2jv: "Instagram",
  cmt3ypa2c002os9txnoyd5i5c: "Instagram",
  cmt3ypa2c002qs9txhs8gavih: "TikTok",
  cmt3ypa2d002ss9tx7817fxz3: "Instagram",
  cmt3ypa2d002us9tx38lsfudl: "Facebook",
  cmt3ypa2e002ws9tx0oh9o92l: "Display Network",
  cmt3ypa2f002ys9txpgr9nm7w: "Facebook",
};

async function main() {
  for (const [id, platform] of Object.entries(PLATFORM_BY_ID)) {
    await prisma.asset.update({ where: { id }, data: { platform } }).catch(() => null);
  }
  console.log("Asset platforms seeded");
}
main().finally(() => prisma.$disconnect());
