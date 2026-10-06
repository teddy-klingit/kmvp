-- Demo accounts (ouhers) and the Audience funnel + comment themes.
ALTER TABLE "Client" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CommunityManagementSnapshot" ADD COLUMN "themes" JSONB;
ALTER TABLE "WebsiteAnalyticsSnapshot" ADD COLUMN "funnel" JSONB;
