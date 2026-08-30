-- ============================================================================
-- Setup
-- ============================================================================
-- gen_random_uuid() (used as the default for every surrogate key below) lives
-- in pgcrypto. Supabase's Postgres image ships it, but the extension must
-- still be created before anything that calls the function.
create extension if not exists pgcrypto with schema extensions;
