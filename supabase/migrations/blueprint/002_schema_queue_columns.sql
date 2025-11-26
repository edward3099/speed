-- ============================================================================
-- Blueprint Migration 002: Queue and Preference Expansion Columns
-- ============================================================================
-- Part 0.1: Add columns for reconnection window and preference expansion
-- ============================================================================

-- Add disconnected_at column for reconnection window
ALTER TABLE matching_queue ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ;

-- Add preference expansion columns to user_preferences table
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS expanded BOOLEAN DEFAULT FALSE;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS expanded_until TIMESTAMPTZ;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS original_min_age INTEGER;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS original_max_age INTEGER;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS original_max_distance INTEGER;

COMMENT ON COLUMN matching_queue.disconnected_at IS 'Timestamp when user disconnected (for 10-second grace period)';
COMMENT ON COLUMN user_preferences.expanded IS 'Whether preferences have been expanded';
COMMENT ON COLUMN user_preferences.expanded_until IS 'When expanded preferences expire';
COMMENT ON COLUMN user_preferences.original_min_age IS 'Original min age before expansion';
COMMENT ON COLUMN user_preferences.original_max_age IS 'Original max age before expansion';
COMMENT ON COLUMN user_preferences.original_max_distance IS 'Original max distance before expansion';

