-- ============================================================================
-- Migration 001: Users Table (Compatibility: Uses existing profiles table)
-- ============================================================================
-- Part 5.1: Core user identity table
-- ============================================================================
-- NOTE: This migration adapts to use existing 'profiles' table instead of creating 'users'
-- ============================================================================

-- Ensure profiles table has required columns for matching engine
DO $$
BEGIN
  -- Add online column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'online') THEN
    ALTER TABLE profiles ADD COLUMN online BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
  
  -- Add cooldown_until column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'cooldown_until') THEN
    ALTER TABLE profiles ADD COLUMN cooldown_until TIMESTAMPTZ;
  END IF;
  
  -- Ensure gender column exists (should already exist)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'gender') THEN
    ALTER TABLE profiles ADD COLUMN gender TEXT CHECK (gender IN ('male', 'female'));
  END IF;
END $$;

-- Create indexes on profiles for matching engine
CREATE INDEX IF NOT EXISTS idx_profiles_online ON profiles(online) WHERE online = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_cooldown ON profiles(cooldown_until) WHERE cooldown_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_gender ON profiles(gender);

-- Create a view 'users' that points to profiles for compatibility
CREATE OR REPLACE VIEW users AS
SELECT 
  id,
  gender,
  online,
  cooldown_until,
  created_at,
  updated_at
FROM profiles;

COMMENT ON VIEW users IS 'Compatibility view: profiles table used as users table for matching engine';
