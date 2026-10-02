-- Brand IQ: the brand agent's section drafts, held for the client's review (nothing is written to Brand OS by itself).
CREATE TABLE "BrandSectionDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "basis" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "BrandSectionDraft_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "BrandSectionDraft_clientId_section_status_idx" ON "BrandSectionDraft"("clientId", "section", "status");
