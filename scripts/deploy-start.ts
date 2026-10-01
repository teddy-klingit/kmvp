import { execSync } from "node:child_process";
import { PrismaClient } from "../src/generated/prisma";

async function seedIfEmpty() {
  const prisma = new PrismaClient();
  const count = await prisma.user.count();
  await prisma.$disconnect();

  if (count === 0) {
    console.log("Database is empty — seeding demo data…");
    execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
  } else {
    console.log(`Skipping seed — ${count} users already exist.`);
  }
}

async function main() {
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
  await seedIfEmpty();
  const port = process.env.PORT ?? "3000";
  execSync(`npx next start -p ${port}`, { stdio: "inherit" });
}

main();
