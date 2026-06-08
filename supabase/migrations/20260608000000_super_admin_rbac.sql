-- ============================================================
-- Super Admin RBAC Migration - Phase 1: Add Value to Enum
-- ============================================================

-- In PostgreSQL, ALTER TYPE ... ADD VALUE cannot be executed inside a transaction
-- block that also contains statements using the new enum value.
-- This script safely creates public.user_role if it doesn't exist, or adds
-- 'Super Admin' to it if it already exists, inside a standalone transaction.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'user_role' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.user_role AS ENUM ('Super Admin', 'Admin', 'Engineer');
  ELSE
    BEGIN
      ALTER TYPE public.user_role ADD VALUE 'Super Admin';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
