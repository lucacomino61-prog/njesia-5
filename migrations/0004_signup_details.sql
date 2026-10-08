-- Sign-up asks for first name, last name, phone, street and email (confirmed by a 6-digit code).
-- Street and phone are team-only: they help the team recognise a neighbour before approving.
ALTER TABLE "user" ADD COLUMN firstName TEXT;
ALTER TABLE "user" ADD COLUMN lastName TEXT;
ALTER TABLE "user" ADD COLUMN street TEXT;
