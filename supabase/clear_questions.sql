-- Truncate the questions table and reset serial identities.
-- WARNING: This permanently deletes all rows in public.questions.
-- Run this only when you are sure (make a backup first if needed).

BEGIN;
TRUNCATE TABLE public.questions RESTART IDENTITY CASCADE;
COMMIT;
