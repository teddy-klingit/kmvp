import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { recordPerformanceSnapshots } from "@/lib/integrations/performance-alerts";
import type { PlatformCampaign } from "@/lib/performance";


function campaign(ctr: number): PlatformCampaign {
  return {
    platform: "LinkedIn",
    accountName: "Test",
    currency: "EUR",
    campaignId: "cmp-1",
    campaignName: "Awareness video",
    impressions: 10_000,
    clicks: Math.round(ctr * 100),
    ctr,
    spend: 100,
    conversions: 0,
    costPerConversion: null,
  };
}

describe("performance drop alerts", () => {
  it("raises one alert for an ongoing drop, not one per check", async () => {
    const fx = await createSecurityFixtures();
    try {
      await prisma.performanceSnapshot.create({
        data: {
          clientId: fx.clientA.id,
          platform: "LinkedIn",
          campaignId: "cmp-1",
          campaignName: "Awareness video",
          ctr: 0.8,
          impressions: 10_000,
          clicks: 80,
          capturedAt: new Date(Date.now() - 6 * 86400000),
        },
      });

      await recordPerformanceSnapshots(fx.clientA.id, [campaign(0.2)]);

      // Age the check past the 6h re-check gate, still dropped.
      await prisma.performanceSnapshot.updateMany({
        where: { clientId: fx.clientA.id, capturedAt: { gte: new Date(Date.now() - 60_000) } },
        data: { capturedAt: new Date(Date.now() - 7 * 3600000) },
      });
      await recordPerformanceSnapshots(fx.clientA.id, [campaign(0.15)]);

      const alerts = await prisma.notification.findMany({
        where: { clientId: fx.clientA.id, title: "Performance drop detected" },
      });
      const signals = await prisma.marketSignal.findMany({ where: { clientId: fx.clientA.id, type: "PERFORMANCE" } });
      expect(alerts).toHaveLength(1);
      expect(signals).toHaveLength(1);
      expect(signals[0].dedupeKey).toBe("perf:LinkedIn:cmp-1");
    } finally {
      await fx.cleanup();
    }
  });

  it("an archived repeat still suppresses re-alerting", async () => {
    const fx = await createSecurityFixtures();
    try {
      await prisma.marketSignal.create({
        data: {
          clientId: fx.clientA.id,
          type: "PERFORMANCE",
          title: "old",
          summary: "old",
          publishedAt: new Date(Date.now() - 2 * 86400000),
          dedupeKey: "perf:LinkedIn:cmp-1",
          archivedAt: new Date(),
        },
      });
      await prisma.performanceSnapshot.create({
        data: {
          clientId: fx.clientA.id,
          platform: "LinkedIn",
          campaignId: "cmp-1",
          campaignName: "Awareness video",
          ctr: 0.8,
          impressions: 10_000,
          clicks: 80,
          capturedAt: new Date(Date.now() - 6 * 86400000),
        },
      });

      await recordPerformanceSnapshots(fx.clientA.id, [campaign(0.2)]);

      const alerts = await prisma.notification.count({ where: { clientId: fx.clientA.id, title: "Performance drop detected" } });
      expect(alerts).toBe(0);
    } finally {
      await fx.cleanup();
    }
  });
});

