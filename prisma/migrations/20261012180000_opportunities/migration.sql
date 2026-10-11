-- Phase R step 4: Opportunities. Insights ideas, calendar suggestions and project inspiration become one object.
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "whyNow" TEXT,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "chart" JSONB,
    "windowStart" DATETIME,
    "windowEnd" DATETIME,
    "windowNote" TEXT,
    "fitsProjectId" TEXT,
    "fitsLabel" TEXT,
    "skillKey" TEXT,
    "insightHref" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "dismissReason" TEXT,
    "dismissedAt" DATETIME,
    "dismissedByUserId" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'weekly',
    "reviewedByUserId" TEXT,
    "reviewedAt" DATETIME,
    "hiddenAt" DATETIME,
    "sourceKey" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Opportunity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Opportunity_clientId_sourceKey_key" ON "Opportunity"("clientId", "sourceKey");
CREATE INDEX "Opportunity_clientId_status_idx" ON "Opportunity"("clientId", "status");

CREATE TABLE "OpportunityRoute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opportunityId" TEXT NOT NULL,
    "letter" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "formats" JSONB NOT NULL DEFAULT '[]',
    "channels" JSONB NOT NULL DEFAULT '[]',
    "sampleLine" TEXT,
    "sampleCheck" JSONB,
    "teamCreditsLow" INTEGER,
    "teamCreditsHigh" INTEGER,
    "aiCredits" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'new',
    "planItemId" TEXT,
    "projectId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpportunityRoute_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OpportunityRoute_opportunityId_idx" ON "OpportunityRoute"("opportunityId");

-- Insights → Market → Ideas.
INSERT INTO "Opportunity" ("id", "clientId", "title", "summary", "whyNow", "sources", "evidence", "chart", "status", "origin", "sourceKey", "insightHref", "createdAt", "updatedAt")
SELECT 'opp_i_' || i."id", i."clientId", i."title", i."detail", i."why",
       CASE WHEN lower(coalesce(i."why", '') || ' ' || i."detail") LIKE '%competitor%' THEN '["competitor"]'
            WHEN json_valid(i."chart") AND json_array_length(i."chart") > 0 THEN '["data"]'
            ELSE '["trend"]' END,
       (SELECT json_group_array(json_object('text', json_extract(e.value, '$.label'), 'source', 'Market feed', 'kind', 'market'))
          FROM json_each(CASE WHEN json_valid(i."evidence") THEN i."evidence" ELSE '[]' END) e),
       CASE WHEN json_valid(i."chart") AND json_array_length(i."chart") > 0 THEN json_object('title', 'From Insights', 'bars', json(i."chart"), 'source', 'Insights') ELSE NULL END,
       CASE i."status" WHEN 'DISMISSED' THEN 'dismissed' WHEN 'BRIEFED' THEN 'briefed' ELSE 'new' END,
       'migrated', 'idea:' || i."id", '/insights/market', i."createdAt", i."updatedAt"
FROM "MarketIntelligenceIdea" i;
INSERT INTO "OpportunityRoute" ("id", "opportunityId", "letter", "name", "description", "formats", "channels", "createdAt")
SELECT 'oppr_i_' || i."id", 'opp_i_' || i."id", 'A', 'As suggested', i."detail", CASE WHEN json_valid(i."formats") THEN i."formats" ELSE '[]' END, '[]', i."createdAt"
FROM "MarketIntelligenceIdea" i;

-- The calendar's suggestions.
INSERT INTO "Opportunity" ("id", "clientId", "title", "summary", "whyNow", "sources", "windowStart", "windowEnd", "status", "origin", "sourceKey", "createdAt", "updatedAt")
SELECT 'opp_s_' || s."id", s."clientId", s."title", s."rationale", s."reason",
       CASE WHEN lower(s."sourceCadence") LIKE '%trend%' THEN '["trend"]' ELSE '["data"]' END,
       s."proposedDate", s."proposedDate",
       CASE s."status" WHEN 'REJECTED' THEN 'dismissed' WHEN 'APPROVED' THEN CASE WHEN s."briefedProjectId" IS NOT NULL THEN 'briefed' ELSE 'added' END ELSE 'new' END,
       'migrated', 'suggestion:' || s."id", s."createdAt", coalesce(s."resolvedAt", s."createdAt")
FROM "ContentPlanSuggestion" s;
INSERT INTO "OpportunityRoute" ("id", "opportunityId", "letter", "name", "description", "formats", "channels", "projectId", "status", "createdAt")
SELECT 'oppr_s_' || s."id", 'opp_s_' || s."id", 'A', 'As suggested', s."rationale", '[]',
       CASE WHEN s."platform" IS NOT NULL THEN json_array(s."platform") ELSE '[]' END, s."briefedProjectId",
       CASE s."status" WHEN 'REJECTED' THEN 'dismissed' WHEN 'APPROVED' THEN CASE WHEN s."briefedProjectId" IS NOT NULL THEN 'briefed' ELSE 'added' END ELSE 'new' END,
       s."createdAt"
FROM "ContentPlanSuggestion" s;

-- Project inspiration.
INSERT INTO "Opportunity" ("id", "clientId", "title", "summary", "sources", "windowStart", "windowEnd", "origin", "sourceKey", "createdAt", "updatedAt")
SELECT 'opp_n_' || n."id", n."clientId", n."title", n."description", CASE WHEN n."targetDate" IS NOT NULL THEN '["seasonal"]' ELSE '["trend"]' END,
       n."targetDate", n."targetDate", 'migrated', 'inspiration:' || n."id", n."createdAt", n."createdAt"
FROM "Inspiration" n;
INSERT INTO "OpportunityRoute" ("id", "opportunityId", "letter", "name", "description", "formats", "channels", "createdAt")
SELECT 'oppr_n_' || n."id", 'opp_n_' || n."id", 'A', 'As suggested', n."description", CASE WHEN json_valid(n."formatTags") THEN n."formatTags" ELSE '[]' END, '[]', n."createdAt"
FROM "Inspiration" n;

-- The scan runs as an assistant: Klingit's cost weekly, the client's AI credits on "Ask for more".
INSERT OR IGNORE INTO "Agent" ("id", "key", "name", "category", "description", "status", "kind", "selfService", "summary", "createdAt")
VALUES ('agent_opportunity_scan', 'opportunity_scan', 'Opportunities', 'FEEDBACK', 'Looks at the client''s results, trends, competitors and the season and suggests what to make next, with 2–3 routes each.', 'LIVE', 'ASSISTANT', false, 'Suggests what to make next', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
