-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LIVE',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "costPerRunCredits" REAL,
    "selfService" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Agent" ("category", "costPerRunCredits", "createdAt", "description", "id", "key", "name", "status", "version") SELECT "category", "costPerRunCredits", "createdAt", "description", "id", "key", "name", "status", "version" FROM "Agent";
DROP TABLE "Agent";
ALTER TABLE "new_Agent" RENAME TO "Agent";
CREATE UNIQUE INDEX "Agent_key_key" ON "Agent"("key");
CREATE TABLE "new_AgentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "projectId" TEXT,
    "clientId" TEXT,
    "input" JSONB,
    "output" JSONB,
    "decision" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "overriddenByUserId" TEXT,
    "overrideReason" TEXT,
    "requestedByUserId" TEXT,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AgentRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AgentRun_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AgentRun_overriddenByUserId_fkey" FOREIGN KEY ("overriddenByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AgentRun_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AgentRun" ("agentId", "clientId", "createdAt", "decision", "durationMs", "id", "input", "output", "overridden", "overriddenByUserId", "overrideReason", "projectId", "status") SELECT "agentId", "clientId", "createdAt", "decision", "durationMs", "id", "input", "output", "overridden", "overriddenByUserId", "overrideReason", "projectId", "status" FROM "AgentRun";
DROP TABLE "AgentRun";
ALTER TABLE "new_AgentRun" RENAME TO "AgentRun";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

