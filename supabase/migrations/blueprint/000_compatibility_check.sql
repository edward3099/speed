-- ============================================================================
-- Migration 000: Compatibility Check and Schema Adaptation
-- ============================================================================
-- This migration adapts the new schema to work with existing tables
-- ============================================================================

-- Check if profiles table exists and has required columns
-- If profiles exists, we'll use it instead of creating users table
-- We'll add missing columns to profiles if needed

DO $$
BEGIN
  -- Add columns to profiles if they don't exist (for compatibility)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
    -- Add online column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'online') THEN
      ALTER TABLE profiles ADD COLUMN online BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
    
    -- Add cooldown_until column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'cooldown_until') THEN
      ALTER TABLE profiles ADD COLUMN cooldown_until TIMESTAMPTZ;
    END IF;
    
    -- Add gender column if missing (assuming it exists, but check)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'gender') THEN
      ALTER TABLE profiles ADD COLUMN gender TEXT CHECK (gender IN ('male', 'female'));
    END IF;
  END IF;
END $$;

-- Create view or use profiles directly as users
-- For now, we'll reference profiles in functions instead of users

COMMENT ON SCHEMA public IS 'Compatibility layer: using existing profiles table instead of users';
