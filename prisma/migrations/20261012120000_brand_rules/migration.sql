-- CreateTable
CREATE TABLE "BrandRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "words" JSONB,
    "scope" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "caughtCount" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "suggestedByUserId" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BrandRule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandRuleChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "ruleId" TEXT,
    "actorUserId" TEXT,
    "byKlingit" BOOLEAN NOT NULL DEFAULT false,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "undoneAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BrandRuleChange_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BrandRule_clientId_status_idx" ON "BrandRule"("clientId", "status");

-- CreateIndex
CREATE INDEX "BrandRuleChange_clientId_createdAt_idx" ON "BrandRuleChange"("clientId", "createdAt");

-- Copy today's rules (BrandOS.toneRules / dos / donts) into BrandRule. The old fields stay as they are.
-- Tone rules → TONE.
INSERT INTO "BrandRule" ("id", "clientId", "type", "text", "source", "sortOrder")
SELECT 'r_' || lower(hex(randomblob(12))), b."clientId", 'TONE', trim(j.value), 'brand_os', j.key
FROM "BrandOS" b, json_each(CASE WHEN json_valid(b."toneRules") THEN b."toneRules" ELSE '[]' END) j
WHERE j.type = 'text' AND trim(j.value) <> '';

-- Legal lines → CLAIMS.
INSERT INTO "BrandRule" ("id", "clientId", "type", "text", "source", "sortOrder")
SELECT 'r_' || lower(hex(randomblob(12))), b."clientId", 'CLAIMS', trim(j.value), 'brand_os', 100 + j.key
FROM "BrandOS" b, json_each(CASE WHEN json_valid(b."dos") THEN b."dos" ELSE '[]' END) j
WHERE j.type = 'text' AND j.value LIKE 'Legal line%';

-- Other do's → DO (except `Use "word"`, which becomes the word list below).
INSERT INTO "BrandRule" ("id", "clientId", "type", "text", "source", "sortOrder")
SELECT 'r_' || lower(hex(randomblob(12))), b."clientId", 'DO', trim(j.value), 'brand_os', 200 + j.key
FROM "BrandOS" b, json_each(CASE WHEN json_valid(b."dos") THEN b."dos" ELSE '[]' END) j
WHERE j.type = 'text' AND j.value NOT LIKE 'Legal line%' AND j.value NOT LIKE 'Use "%"' AND trim(j.value) <> '';

-- Other don'ts → DO, as written (except `Avoid "word"`, which becomes the word list below).
INSERT INTO "BrandRule" ("id", "clientId", "type", "text", "source", "sortOrder")
SELECT 'r_' || lower(hex(randomblob(12))), b."clientId", 'DO', trim(j.value), 'brand_os', 300 + j.key
FROM "BrandOS" b, json_each(CASE WHEN json_valid(b."donts") THEN b."donts" ELSE '[]' END) j
WHERE j.type = 'text' AND j.value NOT LIKE 'Avoid "%"' AND trim(j.value) <> '';

-- Word lists: one WORDS_USE and one WORDS_AVOID list per client, from `Use "x"` / `Avoid "x"`.
INSERT INTO "BrandRule" ("id", "clientId", "type", "text", "words", "source", "sortOrder")
SELECT 'r_' || lower(hex(randomblob(12))), b."clientId", 'WORDS_USE', 'Words we use', json_group_array(replace(substr(j.value, 5), '"', '')), 'word_list', 900
FROM "BrandOS" b, json_each(CASE WHEN json_valid(b."dos") THEN b."dos" ELSE '[]' END) j
WHERE j.type = 'text' AND j.value LIKE 'Use "%"'
GROUP BY b."clientId";

INSERT INTO "BrandRule" ("id", "clientId", "type", "text", "words", "source", "sortOrder")
SELECT 'r_' || lower(hex(randomblob(12))), b."clientId", 'WORDS_AVOID', 'Words we avoid', json_group_array(replace(substr(j.value, 7), '"', '')), 'word_list', 901
FROM "BrandOS" b, json_each(CASE WHEN json_valid(b."donts") THEN b."donts" ELSE '[]' END) j
WHERE j.type = 'text' AND j.value LIKE 'Avoid "%"'
GROUP BY b."clientId";

-- The shared rule check and the guidelines import run as assistants (client AI credits when the client asks).
INSERT OR IGNORE INTO "Agent" ("id", "key", "name", "category", "description", "status", "kind", "selfService", "summary", "createdAt")
VALUES ('agent_rule_check', 'rule_check', 'Rule check', 'QA', 'Checks copy against the client''s Brand OS rules and suggests a fix.', 'LIVE', 'ASSISTANT', false, 'Checks copy against your rules', CURRENT_TIMESTAMP),
       ('agent_rule_import', 'rule_import', 'Guidelines import', 'FOUNDATION', 'Reads uploaded brand guidelines and drafts rules for an admin to approve.', 'LIVE', 'ASSISTANT', false, 'Turns guidelines into draft rules', CURRENT_TIMESTAMP);
