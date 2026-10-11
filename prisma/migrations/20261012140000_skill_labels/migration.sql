-- Skills by goal, with a label (Phase R step 2).
ALTER TABLE "Agent" ADD COLUMN "availability" TEXT;
ALTER TABLE "Agent" ADD COLUMN "goal" TEXT;
ALTER TABLE "Agent" ADD COLUMN "examples" JSONB;
ALTER TABLE "Agent" ADD COLUMN "teamCreditsEstimate" REAL;

-- Labels for the skills there are: standard self-service skills, and each client's own custom skills.
UPDATE "Agent" SET "availability" = 'self_service' WHERE "kind" = 'SKILL' AND "clientId" IS NULL AND "selfService" = 1;
UPDATE "Agent" SET "availability" = 'custom' WHERE "kind" = 'SKILL' AND "clientId" IS NOT NULL;

-- Goal groups: Make an ad · Write copy · Plan & brief.
UPDATE "Agent" SET "goal" = 'make_ad' WHERE "key" IN ('ad_gen', 'image_gen_agent');
UPDATE "Agent" SET "goal" = 'write_copy' WHERE "key" IN ('instagram_caption_agent', 'email_copy_agent', 'linkedin_post_agent', 'landing_page_copy_agent');
UPDATE "Agent" SET "goal" = 'plan_brief' WHERE "key" IN ('brief_generator_agent');
UPDATE "Agent" SET "goal" = CASE WHEN "skillCategory" = 'Visual' THEN 'make_ad' WHEN "skillCategory" = 'Briefs' THEN 'plan_brief' ELSE 'write_copy' END
WHERE "kind" = 'SKILL' AND "clientId" IS NOT NULL AND "goal" IS NULL;

-- New in the catalog: a self-service carousel, and the skills Klingit runs for the client (team credits, placeholders).
INSERT OR IGNORE INTO "Agent" ("id", "key", "name", "category", "description", "status", "kind", "selfService", "skillCategory", "aiCreditsPerRun", "summary", "availability", "goal", "teamCreditsEstimate", "createdAt")
VALUES
  ('agent_carousel_builder', 'carousel_builder', 'Carousel builder', 'PRODUCTION', 'Writes a 4–6 card carousel with a story arc: a headline and a line per card, and a caption.', 'LIVE', 'SKILL', 1, 'Visual', 30, 'A 4–6 card carousel with a story arc', 'self_service', 'make_ad', NULL, CURRENT_TIMESTAMP),
  ('agent_video_cutdowns', 'video_cutdowns', 'Video cutdowns', 'PRODUCTION', 'A Klingit editor cuts a film into 6s, 15s and 9:16 versions; you review them.', 'LIVE', 'SKILL', 0, 'Visual', NULL, 'Cut a film into 6s, 15s and 9:16 versions', 'klingit_run', 'make_ad', 3, CURRENT_TIMESTAMP),
  ('agent_localisation', 'localisation', 'Localisation', 'PRODUCTION', 'A native writer adapts copy for SE, NO, DK and FI, in your voice.', 'LIVE', 'SKILL', 0, 'Copy', NULL, 'Adapt copy for SE, NO, DK and FI by a native writer', 'klingit_run', 'write_copy', 2, CURRENT_TIMESTAMP),
  ('agent_performance_deep_dive', 'performance_deep_dive', 'Performance deep-dive', 'FEEDBACK', 'A Klingit strategist explains why a campaign worked or didn''t, with next steps.', 'LIVE', 'SKILL', 0, 'Briefs', NULL, 'Why a campaign worked or didn''t, with next steps', 'klingit_run', 'plan_brief', 4, CURRENT_TIMESTAMP),
  ('agent_brand_check_service', 'brand_check_service', 'Brand check', 'QA', 'Every asset Klingit makes is checked against your Brand OS before you see it. Always on, nothing extra.', 'LIVE', 'SKILL', 0, 'Briefs', NULL, 'Every asset checked against Brand OS before you see it', 'klingit_run', 'plan_brief', 0, CURRENT_TIMESTAMP);

-- "What do you want to make?": a cheap assistant call that picks the skill and its settings (client AI credits).
INSERT OR IGNORE INTO "Agent" ("id", "key", "name", "category", "description", "status", "kind", "selfService", "summary", "createdAt")
VALUES ('agent_skill_router', 'skill_router', 'Skill finder', 'BRIEF', 'Maps a request in plain words to the best skill (or two) and its settings.', 'LIVE', 'ASSISTANT', 0, 'Finds the skill for what you want to make', CURRENT_TIMESTAMP);
