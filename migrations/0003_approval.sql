-- Writing needs the team's approval (Luca's choice, 2026-10-08, instead of paid SMS codes).
-- approvedAt / declinedAt: when the team decided; joinNote: what the person told the team
-- (team-only, cleared once the team decides).
ALTER TABLE "user" ADD COLUMN approvedAt INTEGER;
ALTER TABLE "user" ADD COLUMN approvedBy TEXT;
ALTER TABLE "user" ADD COLUMN declinedAt INTEGER;
ALTER TABLE "user" ADD COLUMN joinNote TEXT;
-- everyone already able to write keeps that ability
UPDATE "user" SET approvedAt = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE phoneNumberVerified = 1 OR role IN ('admin', 'superadmin');
CREATE INDEX user_pending ON "user" (approvedAt, declinedAt);
