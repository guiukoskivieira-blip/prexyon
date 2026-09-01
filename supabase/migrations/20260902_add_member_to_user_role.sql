-- =============================================================================
-- PREXYON — Migration: Add 'member' value to user_role enum
-- Applied manually to ybsdwcaagcazfedrwhjm.supabase.co on 2026-09-01
-- This file documents the change for auditability; the enum was already
-- patched directly in the database. Re-running this migration is idempotent.
-- =============================================================================

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'member';
