-- Live ad accounts belong to one client (Phase Q: no client ever reads another's campaigns).
ALTER TABLE "IntegrationConnection" ADD COLUMN "clientId" TEXT;
