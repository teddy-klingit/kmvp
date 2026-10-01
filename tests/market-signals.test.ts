import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { recordCompetitorSnapshots } from "@/lib/integrations/market-signals";
import type { LinkedInAdLibraryResult } from "@/lib/integrations/linkedin-ad-library";

let clientId: string;

beforeAll(async () => {
  clientId = (await prisma.client.create({ data: { name: "Signals Co", slug: `signals-${Date.now()}` } })).id;
});
afterAll(async () => {
  await prisma.client.delete({ where: { id: clientId } });
});

const zip = (ids: string[]): LinkedInAdLibraryResult => ({ ok: true, brand: "Zip", total: ids.length, ads: ids.map((adUrl) => ({ adUrl }) as never) });
/** Ages the latest snapshot past the 6h re-check gate, as if the next check came hours later. */
const later = () => prisma.competitorSnapshot.updateMany({ where: { clientId }, data: { capturedAt: new Date(Date.now() - 7 * 3600000) } });

describe("competitor alerts", () => {
  it("raise one alert per competitor per 7 days, like performance alerts", async () => {
    await recordCompetitorSnapshots(clientId, [], [zip(["a"])]);
    await later();
    await recordCompetitorSnapshots(clientId, [], [zip(["a", "b", "c", "d"])]);
    await later();
    await recordCompetitorSnapshots(clientId, [], [zip(["a", "b", "c", "d", "e", "f"])]);

    const alerts = await prisma.marketSignal.findMany({ where: { clientId, type: "COMPETITOR" } });
    expect(alerts.map((a) => a.title)).toEqual(["Zip launched 3 new ads on LinkedIn"]);
    expect(alerts[0].dedupeKey).toBe("competitor:zip");
  });

  it("alerts again once the week has passed", async () => {
    await prisma.marketSignal.updateMany({ where: { clientId }, data: { publishedAt: new Date(Date.now() - 8 * 86400000) } });
    await later();
    await recordCompetitorSnapshots(clientId, [], [zip(["a", "b", "c", "d", "e", "f", "g"])]);
    expect(await prisma.marketSignal.count({ where: { clientId, type: "COMPETITOR" } })).toBe(2);
  });
});
