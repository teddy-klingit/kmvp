-- Agent builds requested by a client are projects; this marks them for "Being built for you".
ALTER TABLE "Project" ADD COLUMN "agentBuild" BOOLEAN NOT NULL DEFAULT false;
