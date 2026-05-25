ALTER TABLE "agent_assignments"
ADD COLUMN "whatsapp_group_url" TEXT;

ALTER TABLE "credit_requests"
ADD COLUMN "whatsapp_group_url_snapshot" TEXT;
