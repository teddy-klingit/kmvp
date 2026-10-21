-- Phase W step 2: findings become records, and an opportunity is built from them (many-to-many).

CREATE TABLE "Insight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "comparison" TEXT,
    "period" TEXT,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "dataSize" TEXT,
    "chart" JSONB,
    "href" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'detector',
    "status" TEXT NOT NULL DEFAULT 'active',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "foundAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Insight_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Insight_clientId_key_key" ON "Insight"("clientId", "key");
CREATE INDEX "Insight_clientId_status_foundAt_idx" ON "Insight"("clientId", "status", "foundAt");

CREATE TABLE "OpportunityInsight" (
    "opportunityId" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("opportunityId", "insightId"),
    CONSTRAINT "OpportunityInsight_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OpportunityInsight_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "Insight" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OpportunityInsight_insightId_idx" ON "OpportunityInsight"("insightId");

-- Every existing opportunity's evidence becomes insight records, linked to it. A Market-feed signal or a key moment
-- used by several opportunities is one insight. Opportunities without any evidence (older ideas copied in Phase R)
-- get no insight: the client doesn't see them until staff link one or archive them. Nothing is deleted.
INSERT OR IGNORE INTO "Insight" ("id", "clientId", "key", "kind", "title", "value", "sources", "href", "origin", "status", "isDemo", "foundAt", "createdAt", "updatedAt")
SELECT
    lower(hex(randomblob(12))),
    o."clientId",
    CASE WHEN json_extract(e.value, '$.ref') LIKE 'signal:%' OR json_extract(e.value, '$.ref') LIKE 'moment:%' THEN json_extract(e.value, '$.ref') ELSE 'evidence:' || o."id" || ':' || e.key END,
    CASE json_extract(e.value, '$.kind') WHEN 'moment' THEN 'moment' WHEN 'market' THEN 'market' ELSE 'data' END,
    coalesce(json_extract(e.value, '$.text'), ''),
    coalesce(json_extract(e.value, '$.value'), ''),
    json_array(coalesce(json_extract(e.value, '$.source'), 'Klingit')),
    CASE WHEN json_extract(e.value, '$.ref') LIKE '/%' THEN json_extract(e.value, '$.ref') WHEN json_extract(e.value, '$.kind') = 'market' THEN '/insights/market' WHEN json_extract(e.value, '$.kind') = 'moment' THEN '/planner' END,
    CASE WHEN json_extract(e.value, '$.ref') LIKE 'signal:%' THEN 'signal' WHEN json_extract(e.value, '$.ref') LIKE 'moment:%' THEN 'moment' ELSE 'evidence' END,
    'active',
    o."isDemo",
    o."createdAt",
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM "Opportunity" o, json_each(o."evidence") e;

INSERT OR IGNORE INTO "OpportunityInsight" ("opportunityId", "insightId", "sortOrder", "createdAt")
SELECT o."id", i."id", e.key, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM "Opportunity" o, json_each(o."evidence") e
JOIN "Insight" i ON i."clientId" = o."clientId"
    AND i."key" = CASE WHEN json_extract(e.value, '$.ref') LIKE 'signal:%' OR json_extract(e.value, '$.ref') LIKE 'moment:%' THEN json_extract(e.value, '$.ref') ELSE 'evidence:' || o."id" || ':' || e.key END;
