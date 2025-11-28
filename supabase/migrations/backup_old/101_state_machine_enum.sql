-- ============================================================================
-- Blueprint Migration 101: State Machine Enum
-- ============================================================================
-- Part 1.1: Single source of truth for all states
-- ============================================================================

-- Single source of truth for all states
CREATE TYPE user_matching_state AS ENUM (
  'idle',              -- User not in system
  'spin_active',       -- User pressed spin, entering queue
  'queue_waiting',     -- User in queue, waiting for match
  'paired',            -- Match found, reveal starting
  'vote_active',       -- Both users voting
  'video_date',        -- Both voted yes, in video session
  'ended',             -- Session completed
  'soft_offline',      -- User disconnected, 10-second grace period
  'disconnected'       -- User went offline (after grace period)
);

COMMENT ON TYPE user_matching_state IS 'Single source of truth for all user matching states';

