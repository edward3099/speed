-- ============================================================================
-- 000_compatibility_check.sql
-- ============================================================================

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


-- ============================================================================
-- 001_users_table.sql
-- ============================================================================

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


-- ============================================================================
-- 002_user_status_table.sql
-- ============================================================================

-- ============================================================================
-- Migration 002: User Status Table
-- ============================================================================
-- Part 5.1: State machine tracking
-- ============================================================================

-- User status table: tracks state of each user
-- NOTE: References profiles(id) since we're using profiles as users
CREATE TABLE IF NOT EXISTS user_status (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('idle', 'spin_active', 'queue_waiting', 'paired', 'vote_active', 'cooldown', 'offline')),
  last_state TEXT,
  last_state_change TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  online_status BOOLEAN NOT NULL DEFAULT TRUE,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  spin_started_at TIMESTAMPTZ,
  vote_window_started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_status_state ON user_status(state);
CREATE INDEX IF NOT EXISTS idx_user_status_online ON user_status(online_status) WHERE online_status = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_status_spin_active ON user_status(state) WHERE state = 'spin_active';

COMMENT ON TABLE user_status IS 'State machine tracking - source of truth for user states';


-- ============================================================================
-- 003_queue_table.sql
-- ============================================================================

-- ============================================================================
-- Migration 003: Queue Table
-- ============================================================================
-- Part 5.1: Waiting room for spin_active users
-- ============================================================================

-- Queue table: all spin_active users go here
-- NOTE: References profiles(id) since we're using profiles as users
-- Check if matching_queue exists - if so, migrate data or create queue alongside
DO $$
BEGIN
  -- If matching_queue exists, we can migrate data or use both
  -- For now, create new queue table
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'queue') THEN
    CREATE TABLE queue (
      user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
      fairness_score INTEGER NOT NULL DEFAULT 0,
      spin_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      preference_stage INTEGER NOT NULL DEFAULT 0 CHECK (preference_stage IN (0, 1, 2, 3)),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_queue_fairness ON queue(fairness_score DESC);
    CREATE INDEX IF NOT EXISTS idx_queue_spin_started ON queue(spin_started_at);
    CREATE INDEX IF NOT EXISTS idx_queue_preference_stage ON queue(preference_stage);
    
    COMMENT ON TABLE queue IS 'Waiting room for spin_active users - stores fairness, wait time, preference stage';
  END IF;
END $$;


-- ============================================================================
-- 004_matches_table.sql
-- ============================================================================

-- ============================================================================
-- Migration 004: Matches Table
-- ============================================================================
-- Part 5.1: Pairing table
-- ============================================================================

-- Matches table: stores pairings
-- NOTE: References profiles(id) since we're using profiles as users
CREATE TABLE IF NOT EXISTS matches (
  id BIGSERIAL PRIMARY KEY,
  user1_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'vote_active', 'cancelled', 'ended')),
  vote_window_expires_at TIMESTAMPTZ,
  UNIQUE(user1_id),
  UNIQUE(user2_id),
  CHECK (user1_id < user2_id) -- Ensure consistent ordering
);

CREATE INDEX IF NOT EXISTS idx_matches_user1 ON matches(user1_id);
CREATE INDEX IF NOT EXISTS idx_matches_user2 ON matches(user2_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_vote_window ON matches(vote_window_expires_at) WHERE vote_window_expires_at IS NOT NULL;

COMMENT ON TABLE matches IS 'Pairing table - enforces one active match per user';


-- ============================================================================
-- 005_votes_table.sql
-- ============================================================================

-- ============================================================================
-- Migration 005: Votes Table
-- ============================================================================
-- Part 5.1: Vote storage
-- ============================================================================

-- Votes table: stores yes or pass votes
-- NOTE: References profiles(id) since we're using profiles as users
CREATE TABLE IF NOT EXISTS votes (
  match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('yes', 'pass')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_match ON votes(match_id);
CREATE INDEX IF NOT EXISTS idx_votes_voter ON votes(voter_id);

COMMENT ON TABLE votes IS 'Vote storage - stores yes or pass votes for each match';


-- ============================================================================
-- 006_never_pair_again_table.sql
-- ============================================================================

-- ============================================================================
-- Migration 006: Never Pair Again Table
-- ============================================================================
-- Part 5.1: Permanent blocklist
-- ============================================================================

-- Never pair again table: permanent ban list
-- NOTE: References profiles(id) since we're using profiles as users
CREATE TABLE IF NOT EXISTS never_pair_again (
  user1 UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user2 UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user1, user2),
  CHECK (user1 < user2) -- Ensure symmetric storage (lowest UUID first)
);

CREATE INDEX IF NOT EXISTS idx_never_pair_again_user1 ON never_pair_again(user1);
CREATE INDEX IF NOT EXISTS idx_never_pair_again_user2 ON never_pair_again(user2);

COMMENT ON TABLE never_pair_again IS 'Permanent blocklist - pairs that can never be matched again';


-- ============================================================================
-- 007_debug_logs_table.sql
-- ============================================================================

-- ============================================================================
-- Migration 007: Debug Logs Table
-- ============================================================================
-- Part 5.1: System observability
-- ============================================================================

-- Debug logs table: central debug table for all events
-- NOTE: References profiles(id) since we're using profiles as users
CREATE TABLE IF NOT EXISTS debug_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  state_before JSONB,
  state_after JSONB,
  metadata JSONB,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_debug_logs_user ON debug_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_debug_logs_event_type ON debug_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_debug_logs_timestamp ON debug_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_debug_logs_severity ON debug_logs(severity);

COMMENT ON TABLE debug_logs IS 'Central debug table for all events - system observability';


-- ============================================================================
-- 101_create_pair_atomic.sql
-- ============================================================================

-- ============================================================================
-- Migration 101: Create Pair Atomic
-- ============================================================================
-- Part 5.2: Atomic pairing engine - heart of the system
-- ============================================================================

-- Create pair atomically with FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION create_pair_atomic(
  p_user1_id UUID,
  p_user2_id UUID
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '10s'
AS $$
DECLARE
  match_id BIGINT;
  user1_record RECORD;
  user2_record RECORD;
  locked_user1 BOOLEAN := FALSE;
  locked_user2 BOOLEAN := FALSE;
BEGIN
  -- 1. Lock both users using FOR UPDATE SKIP LOCKED (consistent order to prevent deadlocks)
  -- Always lock lower UUID first
  -- NOTE: Using profiles table (via users view)
  IF p_user1_id < p_user2_id THEN
    -- Lock user1 first
    SELECT * INTO user1_record
    FROM profiles
    WHERE id = p_user1_id
    FOR UPDATE SKIP LOCKED;
    
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    
    locked_user1 := TRUE;
    
    -- Lock user2
    SELECT * INTO user2_record
    FROM profiles
    WHERE id = p_user2_id
    FOR UPDATE SKIP LOCKED;
    
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    
    locked_user2 := TRUE;
  ELSE
    -- Lock user2 first
    SELECT * INTO user2_record
    FROM profiles
    WHERE id = p_user2_id
    FOR UPDATE SKIP LOCKED;
    
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    
    locked_user2 := TRUE;
    
    -- Lock user1
    SELECT * INTO user1_record
    FROM profiles
    WHERE id = p_user1_id
    FOR UPDATE SKIP LOCKED;
    
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    
    locked_user1 := TRUE;
  END IF;
  
  -- 2. Validate eligibility (re-check inside lock)
  -- Both must be online
  IF NOT user1_record.online OR NOT user2_record.online THEN
    RETURN NULL;
  END IF;
  
  -- Both must not be in cooldown
  IF (user1_record.cooldown_until IS NOT NULL AND user1_record.cooldown_until > NOW()) OR
     (user2_record.cooldown_until IS NOT NULL AND user2_record.cooldown_until > NOW()) THEN
    RETURN NULL;
  END IF;
  
  -- Check user_status: both must be spin_active or queue_waiting
  IF NOT EXISTS (
    SELECT 1 FROM user_status WHERE user_id = p_user1_id AND state IN ('spin_active', 'queue_waiting')
  ) OR NOT EXISTS (
    SELECT 1 FROM user_status WHERE user_id = p_user2_id AND state IN ('spin_active', 'queue_waiting')
  ) THEN
    RETURN NULL;
  END IF;
  
  -- Check never_pair_again (symmetric check)
  IF EXISTS (
    SELECT 1 FROM never_pair_again
    WHERE (user1 = p_user1_id AND user2 = p_user2_id)
       OR (user1 = p_user2_id AND user2 = p_user1_id)
  ) THEN
    RETURN NULL;
  END IF;
  
  -- Check neither already paired
  IF EXISTS (
    SELECT 1 FROM matches
    WHERE (user1_id = p_user1_id OR user2_id = p_user1_id)
      AND status IN ('pending', 'vote_active')
  ) OR EXISTS (
    SELECT 1 FROM matches
    WHERE (user1_id = p_user2_id OR user2_id = p_user2_id)
      AND status IN ('pending', 'vote_active')
  ) THEN
    RETURN NULL;
  END IF;
  
  -- 3. Create match (ensure user1_id < user2_id for consistency)
  INSERT INTO matches (user1_id, user2_id, status, created_at)
  VALUES (
    LEAST(p_user1_id, p_user2_id),
    GREATEST(p_user1_id, p_user2_id),
    'pending',
    NOW()
  )
  RETURNING id INTO match_id;
  
  -- 4. Update both user_status to paired
  UPDATE user_status
  SET state = 'paired',
      last_state = state,
      last_state_change = NOW(),
      updated_at = NOW()
  WHERE user_id IN (p_user1_id, p_user2_id);
  
  -- 5. Remove both from queue
  DELETE FROM queue WHERE user_id IN (p_user1_id, p_user2_id);
  
  RETURN match_id;
END;
$$;

COMMENT ON FUNCTION create_pair_atomic IS 'Atomic pairing engine - locks both users, validates eligibility, creates match, updates states';


-- ============================================================================
-- 102_find_best_match.sql
-- ============================================================================

-- ============================================================================
-- Migration 102: Find Best Match
-- ============================================================================
-- Part 5.3: Priority scoring and candidate selection
-- ============================================================================

-- Find best match for a user based on priority scoring
CREATE OR REPLACE FUNCTION find_best_match(
  p_user_id UUID,
  p_preference_stage INTEGER
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  candidate_id UUID;
  user_gender TEXT;
  user_prefs RECORD;
  best_candidate UUID;
  best_score DECIMAL(10, 2) := -1;
  candidate_score DECIMAL(10, 2);
  candidate_record RECORD;
BEGIN
  -- Get user gender (from profiles table)
  SELECT gender INTO user_gender FROM profiles WHERE id = p_user_id;
  
  -- Get user preferences
  SELECT * INTO user_prefs
  FROM user_preferences
  WHERE user_id = p_user_id;
  
  -- If no preferences, return NULL
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Find candidates based on preference stage
  FOR candidate_record IN
    SELECT 
      q.user_id,
      q.fairness_score,
      EXTRACT(EPOCH FROM (NOW() - q.spin_started_at))::INTEGER as wait_time_seconds,
      u.gender,
      up.min_age,
      up.max_age,
      up.max_distance,
      -- Calculate compatibility score based on preference stage
      CASE
        WHEN p_preference_stage = 0 THEN
          -- Stage 0: exact preferences only
          -- Check age compatibility (partner's age vs user's preferences)
          CASE 
            WHEN (up.min_age <= get_user_age(q.user_id) AND 
                  up.max_age >= get_user_age(q.user_id)) THEN 50
            ELSE 0
          END +
          -- Check distance compatibility (simplified - implement based on your location system)
          CASE
            WHEN up.max_distance >= COALESCE(get_user_distance(p_user_id, q.user_id), 999) THEN 50
            ELSE 0
          END
        WHEN p_preference_stage = 1 THEN
          -- Stage 1: age expanded ±2 years
          CASE 
            WHEN (up.min_age - 2 <= get_user_age(q.user_id) AND 
                  up.max_age + 2 >= get_user_age(q.user_id)) THEN 20
            ELSE 0
          END +
          CASE
            WHEN up.max_distance >= COALESCE(get_user_distance(p_user_id, q.user_id), 999) THEN 50
            ELSE 0
          END
        WHEN p_preference_stage = 2 THEN
          -- Stage 2: age ±4 years, distance × 1.5
          CASE 
            WHEN (up.min_age - 4 <= get_user_age(q.user_id) AND 
                  up.max_age + 4 >= get_user_age(q.user_id)) THEN 20
            ELSE 0
          END +
          CASE
            WHEN (up.max_distance * 1.5) >= COALESCE(get_user_distance(p_user_id, q.user_id), 999) THEN 20
            ELSE 0
          END
        ELSE
          -- Stage 3: full expansion (age and distance relaxed, but gender still strict)
          0
      END as compatibility_score
    FROM queue q
    INNER JOIN profiles u ON u.id = q.user_id
    LEFT JOIN user_preferences up ON up.user_id = q.user_id
    WHERE q.user_id != p_user_id
      AND u.online = TRUE
      AND (u.cooldown_until IS NULL OR u.cooldown_until < NOW())
      AND u.gender != user_gender -- Opposite gender only
      AND NOT EXISTS (
        SELECT 1 FROM never_pair_again npa
        WHERE (npa.user1 = p_user_id AND npa.user2 = q.user_id)
           OR (npa.user1 = q.user_id AND npa.user2 = p_user_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM matches m
        WHERE (m.user1_id = q.user_id OR m.user2_id = q.user_id)
          AND m.status IN ('pending', 'vote_active')
      )
  LOOP
    -- Calculate priority score
    -- Formula: fairness_weight * fairness_score + wait_weight * wait_time + compatibility_weight * compatibility_score + random_jitter
    candidate_score := 
      (1000.0 * candidate_record.fairness_score) +
      (10.0 * candidate_record.wait_time_seconds) +
      (1.0 * candidate_record.compatibility_score) +
      (RANDOM() * 5.0); -- Random jitter 0-5
    
    -- Track best candidate
    IF candidate_score > best_score THEN
      best_score := candidate_score;
      best_candidate := candidate_record.user_id;
    END IF;
  END LOOP;
  
  RETURN best_candidate;
END;
$$;

COMMENT ON FUNCTION find_best_match IS 'Finds best match based on priority scoring: fairness (1000x) + wait_time (10x) + compatibility (1x) + random jitter';


-- ============================================================================
-- 103_process_matching.sql
-- ============================================================================

-- ============================================================================
-- Migration 103: Process Matching
-- ============================================================================
-- Part 5.3: Main matching engine that processes all spin_active users
-- ============================================================================

-- Process matching for all eligible users in queue
CREATE OR REPLACE FUNCTION process_matching()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  matched_count INTEGER := 0;
  user_record RECORD;
  candidate_id UUID;
  match_id BIGINT;
  preference_stage INTEGER;
  wait_time_seconds INTEGER;
BEGIN
  -- Process all users in queue, ordered by priority
  FOR user_record IN
    SELECT 
      q.user_id,
      q.fairness_score,
      q.preference_stage,
      EXTRACT(EPOCH FROM (NOW() - q.spin_started_at))::INTEGER as wait_time_seconds
    FROM queue q
    INNER JOIN profiles u ON u.id = q.user_id
    INNER JOIN user_status us ON us.user_id = q.user_id
    WHERE u.online = TRUE
      AND (u.cooldown_until IS NULL OR u.cooldown_until < NOW())
      AND us.state IN ('spin_active', 'queue_waiting')
    ORDER BY 
      q.fairness_score DESC,
      wait_time_seconds DESC,
      RANDOM() -- Random tiebreaker
  LOOP
    -- Skip if already matched in this cycle
    IF EXISTS (
      SELECT 1 FROM matches
      WHERE (user1_id = user_record.user_id OR user2_id = user_record.user_id)
        AND status IN ('pending', 'vote_active')
    ) THEN
      CONTINUE;
    END IF;
    
    -- Determine preference stage based on wait time
    preference_stage := user_record.preference_stage;
    
    -- Update preference stage if needed
    IF user_record.wait_time_seconds >= 20 THEN
      preference_stage := 3; -- Full expansion
    ELSIF user_record.wait_time_seconds >= 15 THEN
      preference_stage := 2; -- Distance expanded
    ELSIF user_record.wait_time_seconds >= 10 THEN
      preference_stage := 1; -- Age expanded
    ELSE
      preference_stage := 0; -- Exact preferences
    END IF;
    
    -- Update preference stage if changed
    IF preference_stage != user_record.preference_stage THEN
      UPDATE queue
      SET preference_stage = preference_stage,
          updated_at = NOW()
      WHERE user_id = user_record.user_id;
    END IF;
    
    -- Find best match for this user
    candidate_id := find_best_match(user_record.user_id, preference_stage);
    
    -- If candidate found, create pair atomically
    IF candidate_id IS NOT NULL THEN
      match_id := create_pair_atomic(user_record.user_id, candidate_id);
      
      IF match_id IS NOT NULL THEN
        matched_count := matched_count + 1;
        
        -- Transition both to vote_active
        UPDATE user_status
        SET state = 'vote_active',
            vote_window_started_at = NOW(),
            last_state = 'paired',
            last_state_change = NOW(),
            updated_at = NOW()
        WHERE user_id IN (user_record.user_id, candidate_id);
        
        -- Update match status
        UPDATE matches
        SET status = 'vote_active',
            vote_window_expires_at = NOW() + INTERVAL '10 seconds'
        WHERE id = match_id;
      END IF;
    END IF;
  END LOOP;
  
  RETURN matched_count;
END;
$$;

COMMENT ON FUNCTION process_matching IS 'Main matching engine - processes all eligible users in queue, ordered by priority';


-- ============================================================================
-- 104_preference_expansion.sql
-- ============================================================================

-- ============================================================================
-- Migration 104: Preference Expansion
-- ============================================================================
-- Part 5.4: Preference expansion based on wait time
-- ============================================================================

-- Update preference stage based on wait time
CREATE OR REPLACE FUNCTION update_preference_stage(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  wait_time_seconds INTEGER;
  current_stage INTEGER;
  new_stage INTEGER;
BEGIN
  -- Get wait time
  SELECT 
    EXTRACT(EPOCH FROM (NOW() - spin_started_at))::INTEGER,
    preference_stage
  INTO wait_time_seconds, current_stage
  FROM queue
  WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Determine new stage based on wait time
  IF wait_time_seconds >= 20 THEN
    new_stage := 3; -- Full expansion
  ELSIF wait_time_seconds >= 15 THEN
    new_stage := 2; -- Distance expanded
  ELSIF wait_time_seconds >= 10 THEN
    new_stage := 1; -- Age expanded
  ELSE
    new_stage := 0; -- Exact preferences
  END IF;
  
  -- Update if changed
  IF new_stage != current_stage THEN
    UPDATE queue
    SET preference_stage = new_stage,
        updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;
  
  RETURN new_stage;
END;
$$;

COMMENT ON FUNCTION update_preference_stage IS 'Updates preference expansion stage based on wait time: 0-10s=stage0, 10-15s=stage1, 15-20s=stage2, 20s+=stage3';


-- ============================================================================
-- 105_fairness_engine.sql
-- ============================================================================

-- ============================================================================
-- Migration 105: Fairness Engine
-- ============================================================================
-- Part 5.6: Fairness scoring (wait_time + yes_boost_events * 10)
-- ============================================================================

-- Calculate fairness score for a user
CREATE OR REPLACE FUNCTION calculate_fairness_score(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  wait_time_seconds INTEGER;
  yes_boost_events INTEGER;
  fairness_score INTEGER;
BEGIN
  -- Get wait time
  SELECT EXTRACT(EPOCH FROM (NOW() - spin_started_at))::INTEGER
  INTO wait_time_seconds
  FROM queue
  WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Count yes boost events (from debug_logs)
  -- Track yes_boost_events in metadata or separate tracking
  -- For now, count from debug_logs
  SELECT COALESCE(COUNT(*), 0)
  INTO yes_boost_events
  FROM debug_logs
  WHERE user_id = p_user_id
    AND event_type = 'yes_boost_applied'
    AND timestamp > NOW() - INTERVAL '1 hour'; -- Recent boosts only
  
  -- Calculate fairness: wait_time + (yes_boost_events * 10)
  fairness_score := wait_time_seconds + (yes_boost_events * 10);
  
  -- Update queue
  UPDATE queue
  SET fairness_score = fairness_score,
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  RETURN fairness_score;
END;
$$;

-- Apply yes boost (+10 fairness)
CREATE OR REPLACE FUNCTION apply_yes_boost(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Increment fairness by 10
  UPDATE queue
  SET fairness_score = fairness_score + 10,
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Log the boost
  INSERT INTO debug_logs (user_id, event_type, metadata, severity)
  VALUES (p_user_id, 'yes_boost_applied', jsonb_build_object('boost_amount', 10), 'info');
END;
$$;

COMMENT ON FUNCTION calculate_fairness_score IS 'Calculates fairness score: wait_time_seconds + (yes_boost_events * 10)';
COMMENT ON FUNCTION apply_yes_boost IS 'Applies +10 fairness boost to yes voter';


-- ============================================================================
-- 106_vote_engine.sql
-- ============================================================================

-- ============================================================================
-- Migration 106: Vote Engine
-- ============================================================================
-- Part 5.9: Voting engine with correct outcomes
-- ============================================================================

-- Record vote and resolve outcomes
CREATE OR REPLACE FUNCTION record_vote(
  p_user_id UUID,
  p_match_id BIGINT,
  p_vote_type TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  match_record RECORD;
  partner_id UUID;
  partner_vote TEXT;
  result JSONB;
BEGIN
  -- Get match
  SELECT * INTO match_record
  FROM matches
  WHERE id = p_match_id
    AND (user1_id = p_user_id OR user2_id = p_user_id)
    AND status = 'vote_active'
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found or not in vote_active state';
  END IF;
  
  -- Get partner ID
  partner_id := CASE 
    WHEN match_record.user1_id = p_user_id THEN match_record.user2_id
    ELSE match_record.user1_id
  END;
  
  -- Insert/update vote
  INSERT INTO votes (match_id, voter_id, vote_type, created_at)
  VALUES (p_match_id, p_user_id, p_vote_type, NOW())
  ON CONFLICT (match_id, voter_id) DO UPDATE
  SET vote_type = p_vote_type,
      created_at = NOW();
  
  -- Get partner's vote
  SELECT vote_type INTO partner_vote
  FROM votes
  WHERE match_id = p_match_id AND voter_id = partner_id;
  
  -- Handle outcomes
  IF p_vote_type = 'yes' AND partner_vote = 'yes' THEN
    -- Case 1: Both yes → video_date + never_pair_again
    UPDATE matches SET status = 'ended' WHERE id = p_match_id;
    
    UPDATE user_status
    SET state = 'idle',
        last_state = 'vote_active',
        last_state_change = NOW(),
        updated_at = NOW()
    WHERE user_id IN (p_user_id, partner_id);
    
    -- Add to never_pair_again
    INSERT INTO never_pair_again (user1, user2, reason)
    VALUES (
      LEAST(p_user_id, partner_id),
      GREATEST(p_user_id, partner_id),
      'mutual_yes'
    )
    ON CONFLICT DO NOTHING;
    
    result := jsonb_build_object('outcome', 'both_yes', 'next_state', 'video_date');
    
  ELSIF (p_vote_type = 'yes' AND partner_vote = 'pass') OR (p_vote_type = 'pass' AND partner_vote = 'yes') THEN
    -- Case 2: Yes + Pass → yes voter +10 boost + auto respin, pass voter → idle
    DELETE FROM matches WHERE id = p_match_id;
    DELETE FROM votes WHERE match_id = p_match_id;
    
    IF p_vote_type = 'yes' THEN
      -- Current user voted yes, partner passed
      PERFORM apply_yes_boost(p_user_id);
      UPDATE user_status
      SET state = 'spin_active',
          last_state = 'vote_active',
          last_state_change = NOW(),
          updated_at = NOW()
      WHERE user_id = p_user_id;
      
      UPDATE user_status
      SET state = 'idle',
          last_state = 'vote_active',
          last_state_change = NOW(),
          updated_at = NOW()
      WHERE user_id = partner_id;
    ELSE
      -- Current user passed, partner voted yes
      PERFORM apply_yes_boost(partner_id);
      UPDATE user_status
      SET state = 'spin_active',
          last_state = 'vote_active',
          last_state_change = NOW(),
          updated_at = NOW()
      WHERE user_id = partner_id;
      
      UPDATE user_status
      SET state = 'idle',
          last_state = 'vote_active',
          last_state_change = NOW(),
          updated_at = NOW()
      WHERE user_id = p_user_id;
    END IF;
    
    -- Add to never_pair_again (mutual pass)
    INSERT INTO never_pair_again (user1, user2, reason)
    VALUES (
      LEAST(p_user_id, partner_id),
      GREATEST(p_user_id, partner_id),
      'mutual_pass'
    )
    ON CONFLICT DO NOTHING;
    
    result := jsonb_build_object('outcome', 'yes_pass', 'next_state', 'respin');
    
  ELSIF p_vote_type = 'pass' AND partner_vote = 'pass' THEN
    -- Case 5: Both pass → both idle + never_pair_again
    DELETE FROM matches WHERE id = p_match_id;
    DELETE FROM votes WHERE match_id = p_match_id;
    
    UPDATE user_status
    SET state = 'idle',
        last_state = 'vote_active',
        last_state_change = NOW(),
        updated_at = NOW()
    WHERE user_id IN (p_user_id, partner_id);
    
    -- Add to never_pair_again
    INSERT INTO never_pair_again (user1, user2, reason)
    VALUES (
      LEAST(p_user_id, partner_id),
      GREATEST(p_user_id, partner_id),
      'mutual_pass'
    )
    ON CONFLICT DO NOTHING;
    
    result := jsonb_build_object('outcome', 'both_pass', 'next_state', 'idle');
    
  ELSE
    -- Waiting for partner's vote
    result := jsonb_build_object('outcome', 'waiting', 'status', 'vote_active');
  END IF;
  
  RETURN result;
END;
$$;

-- Handle idle voter (countdown expired, no vote)
CREATE OR REPLACE FUNCTION handle_idle_voter(p_user_id UUID, p_match_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  partner_id UUID;
  partner_vote TEXT;
BEGIN
  -- Get partner ID
  SELECT 
    CASE WHEN user1_id = p_user_id THEN user2_id ELSE user1_id END
  INTO partner_id
  FROM matches
  WHERE id = p_match_id;
  
  -- Get partner's vote
  SELECT vote_type INTO partner_vote
  FROM votes
  WHERE match_id = p_match_id AND voter_id = partner_id;
  
  -- Case 4: Yes + Idle → idle user removed, yes voter +10 + auto respin
  IF partner_vote = 'yes' THEN
    -- Partner voted yes, current user is idle
    PERFORM apply_yes_boost(partner_id);
    
    UPDATE user_status
    SET state = 'spin_active',
        last_state = 'vote_active',
        last_state_change = NOW(),
        updated_at = NOW()
    WHERE user_id = partner_id;
  END IF;
  
  -- Idle user goes to idle (must spin manually)
  UPDATE user_status
  SET state = 'idle',
      last_state = 'vote_active',
      last_state_change = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Clean up match
  DELETE FROM matches WHERE id = p_match_id;
  DELETE FROM votes WHERE match_id = p_match_id;
END;
$$;

COMMENT ON FUNCTION record_vote IS 'Records vote and resolves outcomes: both_yes, yes_pass, both_pass, waiting';
COMMENT ON FUNCTION handle_idle_voter IS 'Handles idle voter: removes idle user, gives yes voter boost if applicable';


-- ============================================================================
-- 107_cooldown_engine.sql
-- ============================================================================

-- ============================================================================
-- Migration 107: Cooldown Engine
-- ============================================================================
-- Part 5.8: Cooldown management (5 minutes)
-- ============================================================================

-- Set cooldown for user (5 minutes)
CREATE OR REPLACE FUNCTION set_cooldown(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Set cooldown_until to 5 minutes from now (update profiles table)
  UPDATE profiles
  SET cooldown_until = NOW() + INTERVAL '5 minutes',
      updated_at = NOW()
  WHERE id = p_user_id;
  
  -- Update user_status to cooldown
  UPDATE user_status
  SET state = 'cooldown',
      last_state = state,
      last_state_change = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Remove from queue
  DELETE FROM queue WHERE user_id = p_user_id;
  
  -- Break any active matches
  UPDATE matches
  SET status = 'cancelled'
  WHERE (user1_id = p_user_id OR user2_id = p_user_id)
    AND status IN ('pending', 'vote_active');
  
  -- Log cooldown
  INSERT INTO debug_logs (user_id, event_type, metadata, severity)
  VALUES (p_user_id, 'cooldown_applied', jsonb_build_object('duration_minutes', 5), 'warning');
END;
$$;

-- Check if user is in cooldown
CREATE OR REPLACE FUNCTION is_in_cooldown(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cooldown_until TIMESTAMPTZ;
BEGIN
  SELECT cooldown_until INTO cooldown_until
  FROM profiles
  WHERE id = p_user_id;
  
  RETURN cooldown_until IS NOT NULL AND cooldown_until > NOW();
END;
$$;

COMMENT ON FUNCTION set_cooldown IS 'Sets 5-minute cooldown for user (applied on disconnect)';
COMMENT ON FUNCTION is_in_cooldown IS 'Checks if user is currently in cooldown';


-- ============================================================================
-- 108_blocklist_engine.sql
-- ============================================================================

-- ============================================================================
-- Migration 108: Blocklist Engine
-- ============================================================================
-- Part 5.7: Never pair again management
-- ============================================================================

-- Add pair to never_pair_again blocklist
CREATE OR REPLACE FUNCTION add_to_blocklist(
  p_user1 UUID,
  p_user2 UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert symmetric (lowest UUID first)
  INSERT INTO never_pair_again (user1, user2, reason)
  VALUES (
    LEAST(p_user1, p_user2),
    GREATEST(p_user1, p_user2),
    p_reason
  )
  ON CONFLICT DO NOTHING;
  
  -- Log blocklist addition
  INSERT INTO debug_logs (user_id, event_type, metadata, severity)
  VALUES (
    p_user1,
    'blocklist_added',
    jsonb_build_object('blocked_user', p_user2, 'reason', p_reason),
    'info'
  );
END;
$$;

-- Check if pair is blocked
CREATE OR REPLACE FUNCTION is_blocked(p_user1 UUID, p_user2 UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM never_pair_again
    WHERE (user1 = LEAST(p_user1, p_user2) AND user2 = GREATEST(p_user1, p_user2))
  );
END;
$$;

COMMENT ON FUNCTION add_to_blocklist IS 'Adds pair to never_pair_again blocklist (symmetric storage)';
COMMENT ON FUNCTION is_blocked IS 'Checks if pair is in never_pair_again blocklist';


-- ============================================================================
-- 109_queue_functions.sql
-- ============================================================================

-- ============================================================================
-- Migration 109: Queue Functions
-- ============================================================================
-- Part 5.3: Queue management
-- ============================================================================

-- Join queue
CREATE OR REPLACE FUNCTION join_queue(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_online BOOLEAN;
  user_cooldown TIMESTAMPTZ;
BEGIN
  -- Check user is online (from profiles table)
  SELECT online, cooldown_until INTO user_online, user_cooldown
  FROM profiles
  WHERE id = p_user_id;
  
  IF NOT user_online THEN
    RETURN FALSE;
  END IF;
  
  -- Check cooldown
  IF user_cooldown IS NOT NULL AND user_cooldown > NOW() THEN
    RETURN FALSE;
  END IF;
  
  -- Check not already in queue
  IF EXISTS (SELECT 1 FROM queue WHERE user_id = p_user_id) THEN
    RETURN FALSE;
  END IF;
  
  -- Insert into queue
  INSERT INTO queue (user_id, fairness_score, spin_started_at, preference_stage)
  VALUES (p_user_id, 0, NOW(), 0)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Update user_status to spin_active
  UPDATE user_status
  SET state = 'spin_active',
      spin_started_at = NOW(),
      last_state = COALESCE(state, 'idle'),
      last_state_change = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  RETURN TRUE;
END;
$$;

-- Remove from queue
CREATE OR REPLACE FUNCTION remove_from_queue(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM queue WHERE user_id = p_user_id;
END;
$$;

COMMENT ON FUNCTION join_queue IS 'Joins user to queue - validates online, cooldown, duplicates';
COMMENT ON FUNCTION remove_from_queue IS 'Removes user from queue';


-- ============================================================================
-- 110_state_machine.sql
-- ============================================================================

-- ============================================================================
-- Migration 110: State Machine Transitions
-- ============================================================================
-- Part 4.2: Legal state transitions enforcement
-- ============================================================================

-- Validate state transition
CREATE OR REPLACE FUNCTION validate_state_transition(
  p_user_id UUID,
  p_from_state TEXT,
  p_to_state TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Define legal transitions
  CASE p_from_state
    WHEN 'idle' THEN
      RETURN p_to_state IN ('spin_active');
    WHEN 'spin_active' THEN
      RETURN p_to_state IN ('queue_waiting', 'idle');
    WHEN 'queue_waiting' THEN
      RETURN p_to_state IN ('paired', 'idle');
    WHEN 'paired' THEN
      RETURN p_to_state IN ('vote_active', 'idle');
    WHEN 'vote_active' THEN
      RETURN p_to_state IN ('spin_active', 'idle', 'cooldown');
    WHEN 'cooldown' THEN
      RETURN p_to_state IN ('idle');
    WHEN 'offline' THEN
      RETURN p_to_state IN ('idle');
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;

-- Execute state transition
CREATE OR REPLACE FUNCTION execute_state_transition(
  p_user_id UUID,
  p_to_state TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_state TEXT;
BEGIN
  -- Get current state
  SELECT state INTO current_state
  FROM user_status
  WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    -- Create initial state
    INSERT INTO user_status (user_id, state, online_status, last_heartbeat)
    VALUES (p_user_id, 'idle', TRUE, NOW());
    current_state := 'idle';
  END IF;
  
  -- Validate transition
  IF NOT validate_state_transition(p_user_id, current_state, p_to_state) THEN
    -- Log illegal transition attempt
    INSERT INTO debug_logs (user_id, event_type, metadata, severity)
    VALUES (
      p_user_id,
      'illegal_state_transition',
      jsonb_build_object('from', current_state, 'to', p_to_state),
      'error'
    );
    RETURN FALSE;
  END IF;
  
  -- Execute transition
  UPDATE user_status
  SET state = p_to_state,
      last_state = current_state,
      last_state_change = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION validate_state_transition IS 'Validates legal state transitions according to Part 4.2';
COMMENT ON FUNCTION execute_state_transition IS 'Executes state transition with validation';


-- ============================================================================
-- 111_guardians.sql
-- ============================================================================

-- ============================================================================
-- Migration 111: Guardians
-- ============================================================================
-- Part 5.10: Background checks fixing problems
-- ============================================================================

-- Guardian 1: Remove offline users
CREATE OR REPLACE FUNCTION guardian_remove_offline()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  removed_count INTEGER := 0;
  user_record RECORD;
BEGIN
  -- Find users offline for more than 20 seconds
  FOR user_record IN
    SELECT user_id
    FROM user_status
    WHERE online_status = TRUE
      AND last_heartbeat < NOW() - INTERVAL '20 seconds'
  LOOP
    -- Mark as offline
    UPDATE users SET online = FALSE WHERE id = user_record.user_id;
    UPDATE user_status
    SET state = 'offline',
        online_status = FALSE,
        last_state = state,
        last_state_change = NOW(),
        updated_at = NOW()
    WHERE user_id = user_record.user_id;
    
    -- Remove from queue
    DELETE FROM queue WHERE user_id = user_record.user_id;
    
    -- Break active matches and apply cooldown
    PERFORM set_cooldown(user_record.user_id);
    
    removed_count := removed_count + 1;
  END LOOP;
  
  RETURN removed_count;
END;
$$;

-- Guardian 2: Remove stale matches
CREATE OR REPLACE FUNCTION guardian_remove_stale_matches()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cleaned_count INTEGER := 0;
  match_record RECORD;
  partner_id UUID;
BEGIN
  -- Find stale matches (vote_active for more than 15 seconds)
  FOR match_record IN
    SELECT id, user1_id, user2_id
    FROM matches
    WHERE status = 'vote_active'
      AND vote_window_expires_at < NOW() - INTERVAL '5 seconds'
  LOOP
    -- Get partner
    -- Check votes to see if one voted yes
    IF EXISTS (
      SELECT 1 FROM votes
      WHERE match_id = match_record.id AND vote_type = 'yes'
    ) THEN
      -- One voted yes, give boost
      SELECT voter_id INTO partner_id
      FROM votes
      WHERE match_id = match_record.id AND vote_type = 'yes'
      LIMIT 1;
      
      PERFORM apply_yes_boost(partner_id);
      PERFORM execute_state_transition(partner_id, 'spin_active');
    END IF;
    
    -- Clean up match
    DELETE FROM matches WHERE id = match_record.id;
    DELETE FROM votes WHERE match_id = match_record.id;
    
    -- Set both to idle
    UPDATE user_status
    SET state = 'idle',
        last_state = 'vote_active',
        last_state_change = NOW(),
        updated_at = NOW()
    WHERE user_id IN (match_record.user1_id, match_record.user2_id);
    
    cleaned_count := cleaned_count + 1;
  END LOOP;
  
  RETURN cleaned_count;
END;
$$;

-- Guardian 3: Enforce preference expansion
CREATE OR REPLACE FUNCTION guardian_enforce_expansion()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  -- Update preference stages for all users in queue
  UPDATE queue q
  SET preference_stage = CASE
    WHEN EXTRACT(EPOCH FROM (NOW() - spin_started_at)) >= 20 THEN 3
    WHEN EXTRACT(EPOCH FROM (NOW() - spin_started_at)) >= 15 THEN 2
    WHEN EXTRACT(EPOCH FROM (NOW() - spin_started_at)) >= 10 THEN 1
    ELSE 0
  END,
  updated_at = NOW()
  WHERE preference_stage != CASE
    WHEN EXTRACT(EPOCH FROM (NOW() - spin_started_at)) >= 20 THEN 3
    WHEN EXTRACT(EPOCH FROM (NOW() - spin_started_at)) >= 15 THEN 2
    WHEN EXTRACT(EPOCH FROM (NOW() - spin_started_at)) >= 10 THEN 1
    ELSE 0
  END;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- Main guardian job (runs every 10 seconds)
CREATE OR REPLACE FUNCTION guardian_job()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  result := jsonb_build_object(
    'offline_removed', guardian_remove_offline(),
    'stale_matches_cleaned', guardian_remove_stale_matches(),
    'expansions_updated', guardian_enforce_expansion(),
    'timestamp', NOW()
  );
  
  RETURN result;
END;
$$;

COMMENT ON FUNCTION guardian_remove_offline IS 'Guardian 1: Removes offline users, breaks matches, applies cooldown';
COMMENT ON FUNCTION guardian_remove_stale_matches IS 'Guardian 2: Removes stale matches, applies boosts';
COMMENT ON FUNCTION guardian_enforce_expansion IS 'Guardian 3: Enforces preference expansion based on wait time';
COMMENT ON FUNCTION guardian_job IS 'Main guardian job - runs all guardians';


-- ============================================================================
-- 112_disconnect_handler.sql
-- ============================================================================

-- ============================================================================
-- Migration 112: Disconnect Handler
-- ============================================================================
-- Part 4.7: Disconnection behavior
-- ============================================================================

-- Handle user disconnect
CREATE OR REPLACE FUNCTION handle_disconnect(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  active_match RECORD;
  partner_id UUID;
  partner_vote TEXT;
BEGIN
  -- Get active match if exists
  SELECT * INTO active_match
  FROM matches
  WHERE (user1_id = p_user_id OR user2_id = p_user_id)
    AND status IN ('pending', 'vote_active')
  LIMIT 1;
  
  IF FOUND THEN
    -- Get partner ID
    partner_id := CASE 
      WHEN active_match.user1_id = p_user_id THEN active_match.user2_id
      ELSE active_match.user1_id
    END;
    
    -- Check if partner voted yes
    SELECT vote_type INTO partner_vote
    FROM votes
    WHERE match_id = active_match.id AND voter_id = partner_id;
    
    -- If partner voted yes, give boost and auto respin
    IF partner_vote = 'yes' THEN
      PERFORM apply_yes_boost(partner_id);
      PERFORM execute_state_transition(partner_id, 'spin_active');
      PERFORM join_queue(partner_id);
    END IF;
    
    -- Break match
    DELETE FROM matches WHERE id = active_match.id;
    DELETE FROM votes WHERE match_id = active_match.id;
  END IF;
  
  -- Remove from queue
  DELETE FROM queue WHERE user_id = p_user_id;
  
  -- Apply cooldown
  PERFORM set_cooldown(p_user_id);
  
  -- Log disconnect
  INSERT INTO debug_logs (user_id, event_type, metadata, severity)
  VALUES (p_user_id, 'user_disconnected', jsonb_build_object('had_match', FOUND), 'warning');
END;
$$;

COMMENT ON FUNCTION handle_disconnect IS 'Handles user disconnect: breaks match, applies cooldown, gives partner boost if yes voter';


-- ============================================================================
-- 113_fix_compatibility.sql
-- ============================================================================

-- ============================================================================
-- Migration 113: Fix Compatibility Issues
-- ============================================================================
-- Fixes for compatibility with existing schema
-- ============================================================================

-- Fix find_best_match to work with user_preferences instead of profiles for age/distance
-- Age and distance are in user_preferences, not profiles
-- Profiles might have age, but distance is calculated or in preferences

-- Update find_best_match function to use user_preferences for compatibility scoring
-- This will be handled in the function itself

-- Ensure user_preferences table has required columns
DO $$
BEGIN
  -- Add preference_stage tracking if needed (might already exist)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_preferences') THEN
    -- Check if columns exist, add if missing
    -- Most columns should already exist
    NULL; -- Placeholder - actual columns depend on existing schema
  END IF;
END $$;

-- Create helper function to get user age (from profiles)
CREATE OR REPLACE FUNCTION get_user_age(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_age INTEGER;
BEGIN
  -- Get age from profiles table
  SELECT age INTO user_age
  FROM profiles
  WHERE id = p_user_id;
  
  -- Return age or NULL if not found
  RETURN user_age;
END;
$$;

-- Create helper function to get user distance (calculated or from preferences)
CREATE OR REPLACE FUNCTION get_user_distance(p_user_id UUID, p_partner_id UUID)
RETURNS DECIMAL
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_distance DECIMAL;
  user_location TEXT;
  partner_location TEXT;
BEGIN
  -- Try to get distance from profiles if available
  -- Check if profiles has distance_km column or calculate from location
  -- For now, return a default - implement based on your location system
  -- You may need to calculate haversine distance from lat/lng or use stored distance
  
  -- Placeholder: return default distance
  -- TODO: Implement actual distance calculation based on your schema
  RETURN 50; -- Default distance (miles or km - adjust based on your system)
END;
$$;

COMMENT ON FUNCTION get_user_age IS 'Helper to get user age from profiles';
COMMENT ON FUNCTION get_user_distance IS 'Helper to get distance between users (placeholder)';
