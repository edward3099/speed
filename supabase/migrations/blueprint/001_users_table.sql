-- ============================================================================
-- Migration 001: Users Table
-- ============================================================================
-- Part 5.1: Core user identity table
-- ============================================================================

-- Users table: identity only, never store state here
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  online BOOLEAN NOT NULL DEFAULT TRUE,
  cooldown_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_online ON users(online) WHERE online = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_cooldown ON users(cooldown_until) WHERE cooldown_until IS NOT NULL;

COMMENT ON TABLE users IS 'Core user identity table - stores gender and online status only, no state';
