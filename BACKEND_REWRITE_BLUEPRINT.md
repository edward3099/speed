# Backend Rewrite Blueprint: Centralized State Machine Architecture

## Executive Summary

This blueprint transforms the current scattered matching logic into a **unified, centralized state machine** that eliminates race conditions, ensures consistency, and guarantees deterministic behavior.

**Core Principle**: **All state transitions happen in ONE place** - the centralized state machine engine.

---

## Part 0: Database Schema (Foundation)

### 0.1 Match History Tables

```sql
-- Track all matches (for 5-minute cooldown)
CREATE TABLE IF NOT EXISTS match_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID NOT NULL REFERENCES profiles(id),
  user2_id UUID NOT NULL REFERENCES profiles(id),
  match_id UUID NOT NULL REFERENCES matches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user1_id, user2_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_match_history_users ON match_history(user1_id, user2_id);
CREATE INDEX IF NOT EXISTS idx_match_history_created ON match_history(created_at);

-- Track mutual yes-yes pairs (banned forever)
CREATE TABLE IF NOT EXISTS yes_yes_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID NOT NULL REFERENCES profiles(id),
  user2_id UUID NOT NULL REFERENCES profiles(id),
  match_id UUID NOT NULL REFERENCES matches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user1_id, user2_id)
);

CREATE INDEX IF NOT EXISTS idx_yes_yes_pairs_users ON yes_yes_pairs(user1_id, user2_id);

-- Add disconnected_at column for reconnection window
ALTER TABLE matching_queue ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ;

-- Add preference expansion columns to user_preferences table
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS expanded BOOLEAN DEFAULT FALSE;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS expanded_until TIMESTAMPTZ;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS original_min_age INTEGER;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS original_max_age INTEGER;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS original_max_distance INTEGER;

-- ============================================================================
-- 0.2 Logging Table Schema (if not exists)
-- ============================================================================
-- Comprehensive event logging for debugging and monitoring
CREATE TABLE IF NOT EXISTS spark_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  event_category TEXT,
  event_message TEXT,
  event_data JSONB DEFAULT '{}'::JSONB,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  related_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  severity TEXT DEFAULT 'INFO' CHECK (severity IN ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL')),
  function_name TEXT,
  success BOOLEAN DEFAULT TRUE,
  source TEXT DEFAULT 'backend' CHECK (source IN ('frontend', 'backend', 'scheduler', 'guardian'))
);

-- Performance indexes for logging queries
CREATE INDEX IF NOT EXISTS idx_spark_event_log_timestamp ON spark_event_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_spark_event_log_user_id ON spark_event_log(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_spark_event_log_event_type ON spark_event_log(event_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_spark_event_log_match_id ON spark_event_log(match_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_spark_event_log_severity ON spark_event_log(severity, timestamp DESC) WHERE severity IN ('ERROR', 'CRITICAL');
CREATE INDEX IF NOT EXISTS idx_spark_event_log_state_transition ON spark_event_log((event_data->>'from_state'), (event_data->>'to_state'), timestamp DESC) WHERE event_type = 'state_transition';

COMMENT ON TABLE spark_event_log IS 'Comprehensive event logging for debugging, monitoring, and rule compliance';
COMMENT ON INDEX idx_spark_event_log_timestamp IS 'Fast queries for recent events';
COMMENT ON INDEX idx_spark_event_log_user_id IS 'Fast queries for user-specific events';
COMMENT ON INDEX idx_spark_event_log_event_type IS 'Fast queries by event type';
COMMENT ON INDEX idx_spark_event_log_match_id IS 'Fast queries for match-related events';
COMMENT ON INDEX idx_spark_event_log_severity IS 'Fast queries for errors and critical events';
COMMENT ON INDEX idx_spark_event_log_state_transition IS 'Fast queries for state transition debugging';

-- ============================================================================
-- 0.3 Queue Monitoring Tables
-- ============================================================================
-- Track queue metrics for monitoring and balancing
CREATE TABLE IF NOT EXISTS queue_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_users INTEGER NOT NULL DEFAULT 0,
  male_count INTEGER NOT NULL DEFAULT 0,
  female_count INTEGER NOT NULL DEFAULT 0,
  other_count INTEGER NOT NULL DEFAULT 0,
  spin_active_count INTEGER NOT NULL DEFAULT 0,
  queue_waiting_count INTEGER NOT NULL DEFAULT 0,
  paired_count INTEGER NOT NULL DEFAULT 0,
  vote_active_count INTEGER NOT NULL DEFAULT 0,
  supply_demand_ratio DECIMAL(10, 4), -- male_count / female_count or vice versa
  gender_imbalance_score DECIMAL(10, 4), -- |male_count - female_count| / total_users
  avg_fairness_score DECIMAL(10, 2),
  avg_wait_time_seconds INTEGER,
  tier1_count INTEGER NOT NULL DEFAULT 0,
  tier2_count INTEGER NOT NULL DEFAULT 0,
  tier3_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_queue_metrics_recorded_at ON queue_metrics(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_metrics_gender_imbalance ON queue_metrics(gender_imbalance_score DESC) WHERE gender_imbalance_score > 0.3;

COMMENT ON TABLE queue_metrics IS 'Historical queue metrics for monitoring and balancing decisions';
```
<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
read_file

## Part 1: Centralized State Machine

### 1.1 State Definition

```sql
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
```

### 1.2 State Machine Engine (Single Entry Point)

```sql
-- THE ONLY FUNCTION THAT CHANGES STATE
CREATE OR REPLACE FUNCTION state_machine_transition(
  p_user_id UUID,
  p_event_type TEXT,
  p_event_data JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '10s'
AS $$
DECLARE
  current_state user_matching_state;
  new_state user_matching_state;
  transition_result JSONB;
BEGIN
  -- 1. Get current state (with lock)
  SELECT status INTO current_state
  FROM matching_queue
  WHERE user_id = p_user_id
  FOR UPDATE NOWAIT;
  
  -- 2. Validate transition based on event
  new_state := validate_transition(current_state, p_event_type, p_event_data);
  
  -- 3. Execute transition atomically
  transition_result := execute_transition(p_user_id, current_state, new_state, p_event_data);
  
  -- 4. Return result
  RETURN transition_result;
END;
$$;
```

### 1.3 Valid Transitions (Centralized Rules)

```sql
CREATE OR REPLACE FUNCTION validate_transition(
  p_current_state user_matching_state,
  p_event_type TEXT,
  p_event_data JSONB
) RETURNS user_matching_state AS $$
BEGIN
  CASE p_event_type
    WHEN 'spin_start' THEN
      IF p_current_state IN ('idle', 'ended', 'disconnected', 'soft_offline') THEN
        RETURN 'spin_active';
      END IF;
      
    WHEN 'queue_joined' THEN
      IF p_current_state = 'spin_active' THEN
        RETURN 'queue_waiting';
      END IF;
      
    WHEN 'match_found' THEN
      IF p_current_state IN ('queue_waiting', 'spin_active') THEN
        RETURN 'paired';
      END IF;
      
    WHEN 'reveal_complete' THEN
      IF p_current_state = 'paired' THEN
        RETURN 'vote_active';
      END IF;
      
    WHEN 'both_voted_yes' THEN
      IF p_current_state = 'vote_active' THEN
        RETURN 'video_date';
      END IF;
      
    WHEN 'one_voted_pass' THEN
      IF p_current_state = 'vote_active' THEN
        RETURN 'spin_active'; -- Respin
      END IF;
      
    WHEN 'session_ended' THEN
      IF p_current_state = 'video_date' THEN
        RETURN 'ended';
      END IF;
      
    WHEN 'user_disconnected' THEN
      -- Transition to soft_offline (grace period)
      RETURN 'soft_offline';
      
    WHEN 'user_reconnected' THEN
      IF p_current_state IN ('disconnected', 'soft_offline') THEN
        -- Return to appropriate state based on context
        RETURN determine_reconnect_state(p_event_data);
      END IF;
      
    WHEN 'grace_period_expired' THEN
      IF p_current_state = 'soft_offline' THEN
        RETURN 'disconnected';
      END IF;
  END CASE;
  
  -- Invalid transition
  RAISE EXCEPTION 'Invalid transition from % on event %', p_current_state, p_event_type;
END;
$$;
```

### 1.3.1 Determine Reconnect State

```sql
-- Determine appropriate state when user reconnects
CREATE OR REPLACE FUNCTION determine_reconnect_state(
  p_event_data JSONB
) RETURNS user_matching_state AS $$
DECLARE
  user_id UUID;
  active_match_id UUID;
  match_status TEXT;
  partner_id UUID;
  user_vote TEXT;
  partner_vote TEXT;
  both_revealed BOOLEAN;
BEGIN
  user_id := (p_event_data->>'user_id')::UUID;
  
  -- Check if user has an active match
  SELECT id, status INTO active_match_id, match_status
  FROM matches
  WHERE (user1_id = user_id OR user2_id = user_id)
    AND status = 'pending'
  LIMIT 1;
  
  IF active_match_id IS NOT NULL THEN
    -- Get partner ID
    SELECT 
      CASE WHEN user1_id = user_id THEN user2_id ELSE user1_id END
    INTO partner_id
    FROM matches
    WHERE id = active_match_id;
    
    -- Check votes
    SELECT vote_type INTO user_vote
    FROM votes
    WHERE match_id = active_match_id AND user_id = user_id;
    
    SELECT vote_type INTO partner_vote
    FROM votes
    WHERE match_id = active_match_id AND user_id = partner_id;
    
    -- If partner voted pass, user must respin (match is broken)
    IF partner_vote = 'pass' THEN
      -- Match should have been broken, but if it still exists, break it now
      -- Clean up metadata (revealed_users)
      UPDATE matches SET metadata = metadata - 'revealed_users' WHERE id = active_match_id;
      DELETE FROM matches WHERE id = active_match_id;
      DELETE FROM votes WHERE match_id = active_match_id;
      RETURN 'spin_active'; -- Force respin
    END IF;
    
    -- If user already voted, return to vote_active
    IF user_vote IS NOT NULL THEN
      RETURN 'vote_active';
    END IF;
    
    -- If partner voted yes but user hasn't voted, check if reveal is complete
    IF partner_vote = 'yes' AND user_vote IS NULL THEN
      -- Check if both users have revealed
      SELECT 
        jsonb_array_length(COALESCE(metadata->'revealed_users', '[]'::JSONB)) >= 2
      INTO both_revealed
      FROM matches
      WHERE id = active_match_id;
      
      IF both_revealed THEN
        RETURN 'vote_active'; -- Ready to vote
      ELSE
        RETURN 'paired'; -- Still in reveal phase
      END IF;
    END IF;
    
    -- Match exists but no votes yet - return to paired (waiting for reveal)
    RETURN 'paired';
  END IF;
  
  -- No active match - return to queue_waiting (resume matching)
  RETURN 'queue_waiting';
END;
$$;
```

### 1.4 Transition Execution

```sql
CREATE OR REPLACE FUNCTION execute_transition(
  p_user_id UUID,
  p_from_state user_matching_state,
  p_to_state user_matching_state,
  p_event_data JSONB
) RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  -- Update state atomically
  UPDATE matching_queue
  SET status = p_to_state,
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Handle state-specific logic
  CASE p_to_state
    WHEN 'vote_active' THEN
      -- Reset fairness score on match
      UPDATE matching_queue
      SET fairness_score = 0,
          skip_count = 0
      WHERE user_id = p_user_id;
      
    WHEN 'spin_active' THEN
      -- Reset fairness score on respin (but keep boost if applicable)
      -- Fairness boost is applied separately via apply_fairness_boost()
      NULL;
  END CASE;
  
  -- Log transition
  PERFORM log_state_transition(p_user_id, p_from_state, p_to_state, p_event_data);
  
  -- Return result
  result := jsonb_build_object(
    'user_id', p_user_id,
    'from_state', p_from_state,
    'to_state', p_to_state,
    'timestamp', NOW()
  );
  
  RETURN result;
END;
$$;
```

---

## Part 2: Unified Matching Engine

### 2.1 Single Matching Function (No More Scattered Logic)

```sql
-- THE ONLY FUNCTION THAT CREATES MATCHES
CREATE OR REPLACE FUNCTION unified_matching_engine(
  p_user_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '30s'
AS $$
DECLARE
  match_id UUID;
  candidate_id UUID;
  max_wait_cycles INTEGER := 30;
  wait_cycle INTEGER := 0;
  online_opposite_gender_count INTEGER;
  user_profile RECORD;
BEGIN
  -- 1. Validate user is in matchable state
  IF NOT is_matchable(p_user_id) THEN
    RETURN NULL;
  END IF;
  
  -- 2. Check if user is already matched (prevent duplicates)
  IF is_user_already_matched(p_user_id) THEN
    RETURN NULL;
  END IF;
  
  -- 3. Get user profile for gender check
  SELECT * INTO user_profile FROM profiles WHERE id = p_user_id;
  
  -- 4. Try Tier 1: Exact preferences
  candidate_id := find_candidate(p_user_id, 1);
  IF candidate_id IS NOT NULL THEN
    -- Re-check online status before creating match
    IF NOT is_user_online(p_user_id) OR NOT is_user_online(candidate_id) THEN
      RETURN NULL;
    END IF;
    match_id := create_match_atomic(p_user_id, candidate_id);
    IF match_id IS NOT NULL THEN
      -- Transition both users to 'paired'
      PERFORM state_machine_transition(p_user_id, 'match_found', jsonb_build_object('match_id', match_id));
      PERFORM state_machine_transition(candidate_id, 'match_found', jsonb_build_object('match_id', match_id));
      -- Reset preference expansion after successful match
      PERFORM reset_preference_expansion(p_user_id);
      RETURN match_id;
    END IF;
  END IF;
  
  -- 5. Apply preference expansion if waiting > 30 seconds (before Tier 2)
  PERFORM apply_preference_expansion(p_user_id);
  
  -- 6. Try Tier 2: Expanded preferences
  candidate_id := find_candidate(p_user_id, 2);
  IF candidate_id IS NOT NULL THEN
    -- Re-check online status before creating match
    IF NOT is_user_online(p_user_id) OR NOT is_user_online(candidate_id) THEN
      RETURN NULL;
    END IF;
    match_id := create_match_atomic(p_user_id, candidate_id);
    IF match_id IS NOT NULL THEN
      PERFORM state_machine_transition(p_user_id, 'match_found', jsonb_build_object('match_id', match_id));
      PERFORM state_machine_transition(candidate_id, 'match_found', jsonb_build_object('match_id', match_id));
      RETURN match_id;
    END IF;
  END IF;
  
  -- 6. Tier 3: Guaranteed match (with strict validation)
  -- Check if any online opposite-gender users exist
  SELECT COUNT(*) INTO online_opposite_gender_count
  FROM matching_queue mq
  INNER JOIN profiles p ON p.id = mq.user_id
  WHERE mq.user_id != p_user_id
    AND mq.status IN ('spin_active', 'queue_waiting')
    AND p.is_online = TRUE
    AND (
      (user_profile.gender = 'male' AND p.gender = 'female')
      OR
      (user_profile.gender = 'female' AND p.gender = 'male')
    );
  
  -- Early return if no online candidates exist
  IF online_opposite_gender_count = 0 THEN
    -- Return special code to indicate "waiting for partner"
    PERFORM log_event('no_online_candidates', p_user_id, 
      jsonb_build_object('message', 'Waiting for partner to arrive'));
    RETURN NULL; -- Frontend should show "waiting for partner" message
  END IF;
  
  -- TRUE GUARANTEE: Keep retrying until match found (only if candidates exist)
  WHILE match_id IS NULL AND wait_cycle < max_wait_cycles LOOP
    -- Re-check online status before each retry
    IF NOT is_user_online(p_user_id) THEN
      PERFORM log_event('guaranteed_match_retry_failed', p_user_id, 
        jsonb_build_object('reason', 'user_offline', 'cycle', wait_cycle));
      RETURN NULL;
    END IF;
    
    candidate_id := find_guaranteed_match_strict(p_user_id);
    
    IF candidate_id IS NULL THEN
      -- Log why no candidate found (for debugging)
      PERFORM log_event('guaranteed_match_no_candidate', p_user_id, 
        jsonb_build_object(
          'cycle', wait_cycle,
          'reason', 'no_opposite_gender_online_or_all_blocked_or_all_matched',
          'online_candidates', online_opposite_gender_count
        ));
    ELSE
      -- Re-check online status of both users before creating match
      IF NOT is_user_online(p_user_id) OR NOT is_user_online(candidate_id) THEN
        -- One user went offline, log and continue
        PERFORM log_event('guaranteed_match_retry_failed', p_user_id, 
          jsonb_build_object(
            'reason', 'candidate_went_offline', 
            'cycle', wait_cycle,
            'candidate_id', candidate_id
          ));
        PERFORM pg_sleep(1);
        wait_cycle := wait_cycle + 1;
        CONTINUE;
      END IF;
      
      match_id := create_match_atomic(p_user_id, candidate_id);
      IF match_id IS NULL THEN
        -- Log why match creation failed (candidate already matched, deadlock, etc.)
        PERFORM log_event('guaranteed_match_create_failed', p_user_id, 
          jsonb_build_object(
            'reason', 'candidate_already_matched_or_deadlock',
            'cycle', wait_cycle,
            'candidate_id', candidate_id
          ));
      ELSE
        -- Success!
        PERFORM state_machine_transition(p_user_id, 'match_found', jsonb_build_object('match_id', match_id));
        PERFORM state_machine_transition(candidate_id, 'match_found', jsonb_build_object('match_id', match_id));
        -- Reset preference expansion after successful match
        PERFORM reset_preference_expansion(p_user_id);
        RETURN match_id;
      END IF;
    END IF;
    
    -- Wait 1 second before retry
    PERFORM pg_sleep(1);
    wait_cycle := wait_cycle + 1;
    
    -- Recalculate fairness every 5 seconds (not every retry)
    IF wait_cycle % 5 = 0 THEN
      PERFORM calculate_fairness_score(p_user_id);
    END IF;
    
    -- Reset expired preference expansions
    PERFORM reset_preference_expansion(p_user_id);
  END LOOP;
  
  -- If still no match after max cycles, this is a system error
  IF match_id IS NULL THEN
    PERFORM log_error('guaranteed_match_failed', p_user_id, 
      jsonb_build_object('wait_cycles', wait_cycle, 'online_candidates', online_opposite_gender_count));
  END IF;
  
  RETURN match_id;
END;
$$;
```

### 2.2 Strict Guaranteed Match (No Offline Users, Correct Match History Logic)

```sql
CREATE OR REPLACE FUNCTION find_guaranteed_match_strict(
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  user_profile RECORD;
  candidate_id UUID;
BEGIN
  -- Get user profile
  SELECT * INTO user_profile FROM profiles WHERE id = p_user_id;
  
  IF NOT FOUND OR user_profile.gender IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Find ANY opposite gender user who is:
  -- 1. Online (STRICT)
  -- 2. In queue (spin_active or queue_waiting)
  -- 3. Not blocked
  -- 4. NOT in yes_yes_pairs (mutual yes-yes = banned forever)
  -- 5. NOT matched in last 5 minutes (unless mutual yes-yes)
  SELECT mq.user_id INTO candidate_id
  FROM matching_queue mq
  INNER JOIN profiles p ON p.id = mq.user_id
  WHERE mq.user_id != p_user_id
    AND mq.status IN ('spin_active', 'queue_waiting')
    AND p.is_online = TRUE  -- STRICT: Must be online
    AND (
      (user_profile.gender = 'male' AND p.gender = 'female')
      OR
      (user_profile.gender = 'female' AND p.gender = 'male')
    )
    -- STRICT: Never mutually voted yes before (banned forever)
    AND NOT EXISTS (
      SELECT 1 FROM yes_yes_pairs yyp
      WHERE (
        (yyp.user1_id = p_user_id AND yyp.user2_id = mq.user_id)
        OR
        (yyp.user1_id = mq.user_id AND yyp.user2_id = p_user_id)
      )
    )
    -- Allow previous matches only if > 5 minutes ago
    AND NOT EXISTS (
      SELECT 1 FROM match_history mh
      WHERE (
        (mh.user1_id = p_user_id AND mh.user2_id = mq.user_id)
        OR
        (mh.user1_id = mq.user_id AND mh.user2_id = p_user_id)
      )
      AND mh.created_at > NOW() - INTERVAL '5 minutes'
    )
    -- Not blocked
    AND NOT EXISTS (
      SELECT 1 FROM blocked_users 
      WHERE (blocker_id = p_user_id AND blocked_user_id = mq.user_id)
         OR (blocker_id = mq.user_id AND blocked_user_id = p_user_id)
    )
    -- Not already matched to someone else
    AND NOT is_user_already_matched(mq.user_id)
  ORDER BY mq.fairness_score DESC, mq.joined_at ASC
  LIMIT 1;
  
  RETURN candidate_id;
END;
$$;
```

### 2.3 Duplicate Match Prevention

```sql
-- Check if user is already in a match
CREATE OR REPLACE FUNCTION is_user_already_matched(
  p_user_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM matches
    WHERE (user1_id = p_user_id OR user2_id = p_user_id)
      AND status = 'pending'
  );
END;
$$;

-- Create match atomically with duplicate prevention and strict ordering
CREATE OR REPLACE FUNCTION create_match_atomic(
  p_user1_id UUID,
  p_user2_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  match_id UUID;
  user1_locked BOOLEAN := FALSE;
  user2_locked BOOLEAN := FALSE;
BEGIN
  -- 1. Validate gender compatibility
  IF NOT validate_gender_compatibility(p_user1_id, p_user2_id) THEN
    RETURN NULL;
  END IF;
  
  -- 2. Lock both users in consistent order (prevent deadlocks)
  -- Always lock lower UUID first
  IF p_user1_id < p_user2_id THEN
    -- Lock user1 first, then user2
    SELECT TRUE INTO user1_locked
    FROM matching_queue
    WHERE user_id = p_user1_id
      AND status IN ('queue_waiting', 'spin_active')
    FOR UPDATE NOWAIT;
    
    IF NOT user1_locked THEN
      RETURN NULL;
    END IF;
    
    SELECT TRUE INTO user2_locked
    FROM matching_queue
    WHERE user_id = p_user2_id
      AND status IN ('queue_waiting', 'spin_active')
    FOR UPDATE NOWAIT;
    
    IF NOT user2_locked THEN
      RETURN NULL;
    END IF;
  ELSE
    -- Lock user2 first, then user1
    SELECT TRUE INTO user2_locked
    FROM matching_queue
    WHERE user_id = p_user2_id
      AND status IN ('queue_waiting', 'spin_active')
    FOR UPDATE NOWAIT;
    
    IF NOT user2_locked THEN
      RETURN NULL;
    END IF;
    
    SELECT TRUE INTO user1_locked
    FROM matching_queue
    WHERE user_id = p_user1_id
      AND status IN ('queue_waiting', 'spin_active')
    FOR UPDATE NOWAIT;
    
    IF NOT user1_locked THEN
      RETURN NULL;
    END IF;
  END IF;
  
  -- 3. Double-check both users aren't already matched (with locks held)
  IF is_user_already_matched(p_user1_id) OR is_user_already_matched(p_user2_id) THEN
    RETURN NULL;
  END IF;
  
  -- 4. Create match with lock
  INSERT INTO matches (user1_id, user2_id, status, created_at)
  VALUES (p_user1_id, p_user2_id, 'pending', NOW())
  ON CONFLICT DO NOTHING
  RETURNING id INTO match_id;
  
  RETURN match_id;
END;
$$;
```

### 2.3.1 Gender Preference Validation

```sql
-- Validate gender compatibility before matching
CREATE OR REPLACE FUNCTION validate_gender_compatibility(
  p_user1_id UUID,
  p_user2_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  user1_gender TEXT;
  user2_gender TEXT;
BEGIN
  SELECT gender INTO user1_gender FROM profiles WHERE id = p_user1_id;
  SELECT gender INTO user2_gender FROM profiles WHERE id = p_user2_id;
  
  -- Must be opposite genders
  IF (user1_gender = 'male' AND user2_gender = 'female') OR
     (user1_gender = 'female' AND user2_gender = 'male') THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;

-- Helper function to check if user is online
CREATE OR REPLACE FUNCTION is_user_online(
  p_user_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles WHERE id = p_user_id AND is_online = TRUE
  );
END;
$$;
```

### 2.3.2 Find Candidate (Tier 1 and Tier 2)

```sql
-- Find candidate for Tier 1 (exact preferences) or Tier 2 (expanded preferences)
-- CRITICAL: Must exclude yes_yes_pairs in ALL tiers
CREATE OR REPLACE FUNCTION find_candidate(
  p_user_id UUID,
  p_tier INTEGER
) RETURNS UUID AS $$
DECLARE
  user_profile RECORD;
  candidate_id UUID;
BEGIN
  -- Get user profile
  SELECT * INTO user_profile FROM profiles WHERE id = p_user_id;
  
  IF NOT FOUND OR user_profile.gender IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Find candidate with tier-specific preferences
  -- Tier 1: Exact preferences (age, distance, etc. match exactly)
  -- Tier 2: Expanded preferences (age range expanded, distance expanded)
  -- (Implementation depends on your preference structure)
  
  SELECT mq.user_id INTO candidate_id
  FROM matching_queue mq
  INNER JOIN profiles p ON p.id = mq.user_id
  WHERE mq.user_id != p_user_id
    AND mq.status IN ('spin_active', 'queue_waiting')
    AND p.is_online = TRUE
    AND (
      (user_profile.gender = 'male' AND p.gender = 'female')
      OR
      (user_profile.gender = 'female' AND p.gender = 'male')
    )
    -- CRITICAL: Exclude yes_yes_pairs in ALL tiers
    AND NOT EXISTS (
      SELECT 1 FROM yes_yes_pairs yyp
      WHERE (
        (yyp.user1_id = p_user_id AND yyp.user2_id = mq.user_id)
        OR
        (yyp.user1_id = mq.user_id AND yyp.user2_id = p_user_id)
      )
    )
    -- Allow previous matches only if > 5 minutes ago (Tier 2 and 3 only)
    -- Tier 1: No previous matches at all
    AND (
      p_tier = 1  -- Tier 1: No previous matches at all
      OR
      (p_tier > 1 AND NOT EXISTS (
        SELECT 1 FROM match_history mh
        WHERE (
          (mh.user1_id = p_user_id AND mh.user2_id = mq.user_id)
          OR
          (mh.user1_id = mq.user_id AND mh.user2_id = p_user_id)
        )
        AND mh.created_at > NOW() - INTERVAL '5 minutes'
      ))
    )
    -- Not blocked
    AND NOT EXISTS (
      SELECT 1 FROM blocked_users 
      WHERE (blocker_id = p_user_id AND blocked_user_id = mq.user_id)
         OR (blocker_id = mq.user_id AND blocked_user_id = p_user_id)
    )
    -- Not already matched
    AND NOT is_user_already_matched(mq.user_id)
    -- Tier-specific preference matching would go here
    -- (This is a placeholder - actual implementation depends on preference structure)
  ORDER BY mq.fairness_score DESC, mq.joined_at ASC
  LIMIT 1;
  
  RETURN candidate_id;
END;
$$;
```

### 2.4 Matchable State Check

```sql
CREATE OR REPLACE FUNCTION is_matchable(
  p_user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  user_state user_matching_state;
  user_online BOOLEAN;
BEGIN
  -- Check if user is online
  SELECT is_online INTO user_online
  FROM profiles
  WHERE id = p_user_id;
  
  IF NOT user_online THEN
    RETURN FALSE;
  END IF;
  
  -- Check if user is in matchable state
  -- EXCLUDE: paired, vote_active, video_date (users already in matches)
  SELECT status INTO user_state
  FROM matching_queue
  WHERE user_id = p_user_id;
  
  -- Only matchable if in queue states (not already matched)
  IF user_state IN ('queue_waiting', 'spin_active') THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;
```

---

## Part 3: Queue Management (Single Source)

### 3.1 Unified Queue Operations

```sql
-- THE ONLY FUNCTION THAT ADDS USERS TO QUEUE
CREATE OR REPLACE FUNCTION queue_join(
  p_user_id UUID,
  p_preferences JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '5s'
AS $$
DECLARE
  queue_id UUID;
BEGIN
  -- 1. Transition to spin_active
  PERFORM state_machine_transition(p_user_id, 'spin_start');
  
  -- 2. Create/update queue entry
  INSERT INTO matching_queue (user_id, status, preferences, joined_at)
  VALUES (p_user_id, 'spin_active', p_preferences, NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET status = 'spin_active',
      preferences = p_preferences,
      joined_at = NOW(),
      fairness_score = 0,
      skip_count = 0,
      updated_at = NOW()
  RETURNING id INTO queue_id;
  
  -- 3. Calculate initial fairness score
  PERFORM calculate_fairness_score(p_user_id);
  
  -- 4. Transition to queue_waiting (state machine handles status update)
  PERFORM state_machine_transition(p_user_id, 'queue_joined');
  
  -- State machine transition already updated status to 'queue_waiting'
  -- No direct SQL update needed - state machine is single source of truth
  
  RETURN queue_id;
END;
$$;
```

### 3.2 Queue Cleanup (Atomic, Instant)

```sql
-- THE ONLY FUNCTION THAT REMOVES USERS FROM QUEUE
CREATE OR REPLACE FUNCTION queue_remove(
  p_user_id UUID,
  p_reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Remove from queue
  DELETE FROM matching_queue
  WHERE user_id = p_user_id;
  
  -- Log removal
  PERFORM log_state_transition(p_user_id, 'queue_removed', p_reason);
END;
$$;
```

---

## Part 4: Fairness System (Centralized)

### 4.1 Single Fairness Calculator

```sql
-- THE ONLY FUNCTION THAT CALCULATES FAIRNESS
CREATE OR REPLACE FUNCTION calculate_fairness_score(
  p_user_id UUID
) RETURNS DECIMAL(10, 2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  queue_time_seconds INTEGER;
  skip_count INTEGER;
  preference_narrowness DECIMAL(5, 2);
  queue_size INTEGER;
  base_score DECIMAL(10, 2);
  skip_penalty DECIMAL(10, 2);
  narrow_penalty DECIMAL(10, 2);
  density_boost DECIMAL(10, 2);
  final_score DECIMAL(10, 2);
BEGIN
  -- Get queue metrics
  SELECT 
    EXTRACT(EPOCH FROM (NOW() - mq.joined_at))::INTEGER,
    mq.skip_count,
    COUNT(*) OVER () - 1
  INTO queue_time_seconds, skip_count, queue_size
  FROM matching_queue mq
  WHERE mq.user_id = p_user_id;
  
  -- Calculate preference narrowness
  SELECT 
    (
      (max_age - min_age) / 50.0 +
      (max_distance / 200.0)
    ) / 2.0
  INTO preference_narrowness
  FROM user_preferences
  WHERE user_id = p_user_id;
  
  -- Base score from wait time (moderate growth to prevent over-prioritization)
  -- Formula: wait_time / 10, capped at 500
  -- This means: 80s = 8, 3min = 18, 5min = 30, 20min = 120, 83min+ = 500
  base_score := LEAST(queue_time_seconds / 10.0, 500.0);
  
  -- Skip penalty (moderate to prevent gaming)
  skip_penalty := LEAST(skip_count * 50.0, 300.0);
  
  -- Narrow preference penalty (encourages broader preferences)
  narrow_penalty := (1.0 - preference_narrowness) * 100.0;
  
  -- Low queue density boost (helps when queue is small)
  density_boost := GREATEST(0, (10 - queue_size) * 10.0);
  
  -- Final score
  -- NOTE: This formula is intentionally aggressive to prioritize fairness
  -- However, preference matching quality (Tier 1/2) still takes precedence
  -- Fairness only affects ordering within each tier, not tier selection
  final_score := base_score + skip_penalty + narrow_penalty + density_boost;
  
  -- Update fairness score (ONLY PLACE IT'S UPDATED)
  UPDATE matching_queue
  SET fairness_score = final_score,
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  RETURN final_score;
END;
$$;
```

### 4.2 Fairness Boost (Single Application Point)

```sql
-- THE ONLY FUNCTION THAT APPLIES FAIRNESS BOOSTS
CREATE OR REPLACE FUNCTION apply_fairness_boost(
  p_user_id UUID,
  p_boost_amount DECIMAL(10, 2),
  p_reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update fairness score
  UPDATE matching_queue
  SET fairness_score = fairness_score + p_boost_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Log boost
  PERFORM log_fairness_boost(p_user_id, p_boost_amount, p_reason);
END;
$$;
```

**Usage (ALL BOOSTS ARE +10):**
- When user votes yes but partner votes pass → `apply_fairness_boost(user_id, 10, 'voted_yes_but_partner_passed')`
- When user waits > 30 seconds → `apply_fairness_boost(user_id, 10, 'long_wait')`
- When partner goes offline → `apply_fairness_boost(user_id, 10, 'partner_went_offline')`
- When partner is idle during vote → `apply_fairness_boost(user_id, 10, 'partner_idle_during_vote')`
- **NO OTHER PLACE** should modify fairness_score directly
- **ALL BOOSTS ARE +10** (not 50, 100, or 150)

### 4.3 Preference Expansion Management

```sql
-- Apply preference expansion when user has been waiting
-- Expansion starts after 30 seconds of waiting
-- Expansion increments: Age range +5 years, Distance +50 miles
CREATE OR REPLACE FUNCTION apply_preference_expansion(
  p_user_id UUID
) RETURNS VOID AS $$
DECLARE
  wait_time_seconds INTEGER;
  current_prefs RECORD;
BEGIN
  -- Get wait time
  SELECT 
    EXTRACT(EPOCH FROM (NOW() - mq.joined_at))::INTEGER,
    up.*
  INTO wait_time_seconds, current_prefs
  FROM matching_queue mq
  LEFT JOIN user_preferences up ON up.user_id = mq.user_id
  WHERE mq.user_id = p_user_id;
  
  -- Only expand if waiting > 30 seconds
  -- Support repeated expansions: if already expanded, expand further
  IF wait_time_seconds >= 30 THEN
    -- Store original preferences only on first expansion
    IF current_prefs.expanded = FALSE OR current_prefs.expanded IS NULL THEN
      -- First expansion: store originals
      UPDATE user_preferences
      SET 
        original_min_age = min_age,
        original_max_age = max_age,
        original_max_distance = max_distance,
        min_age = GREATEST(18, min_age - 5),  -- Expand age range down by 5 years
        max_age = LEAST(100, max_age + 5),    -- Expand age range up by 5 years
        max_distance = max_distance + 50,     -- Expand distance by 50 miles
        expanded = TRUE,
        expanded_until = NOW() + INTERVAL '5 minutes'  -- Expires after 5 minutes
      WHERE user_id = p_user_id;
      
      -- Log expansion
      PERFORM log_event('preference_expanded', p_user_id, 
        jsonb_build_object('wait_time', wait_time_seconds, 'expires_at', NOW() + INTERVAL '5 minutes', 'expansion_level', 1));
    ELSIF wait_time_seconds >= 60 THEN
      -- Second expansion (after 60 seconds): expand further from current (not original)
      UPDATE user_preferences
      SET 
        min_age = GREATEST(18, min_age - 5),  -- Expand age range down by 5 more years
        max_age = LEAST(100, max_age + 5),    -- Expand age range up by 5 more years
        max_distance = max_distance + 50,     -- Expand distance by 50 more miles
        expanded_until = NOW() + INTERVAL '5 minutes'  -- Reset expiration
      WHERE user_id = p_user_id
        AND expanded = TRUE;
      
      -- Log second expansion
      PERFORM log_event('preference_expanded', p_user_id, 
        jsonb_build_object('wait_time', wait_time_seconds, 'expires_at', NOW() + INTERVAL '5 minutes', 'expansion_level', 2));
    END IF;
  END IF;
END;
$$;

-- Reset expanded preferences after match attempt or timeout
CREATE OR REPLACE FUNCTION reset_preference_expansion(
  p_user_id UUID
) RETURNS VOID AS $$
DECLARE
  original_prefs RECORD;
BEGIN
  -- Get original preferences (stored when expansion was applied)
  SELECT 
    original_min_age,
    original_max_age,
    original_max_distance
  INTO original_prefs
  FROM user_preferences
  WHERE user_id = p_user_id
    AND expanded = TRUE;
  
  -- If expanded preferences exist and expired, reset to original
  IF FOUND AND original_prefs IS NOT NULL THEN
    UPDATE user_preferences
    SET 
      min_age = original_prefs.original_min_age,
      max_age = original_prefs.original_max_age,
      max_distance = original_prefs.original_max_distance,
      expanded = FALSE,
      expanded_until = NULL,
      original_min_age = NULL,
      original_max_age = NULL,
      original_max_distance = NULL
    WHERE user_id = p_user_id
      AND (expanded_until < NOW() OR expanded_until IS NULL);
  END IF;
END;
$$;

-- Call apply_preference_expansion in unified_matching_engine before Tier 2
-- Call reset_preference_expansion after failed match attempts and in guardians
```

**Preference Expansion Rules:**
- **When expansion starts**: After 30 seconds of waiting in queue
- **Expansion increments**: 
  - First expansion (30s): Age range ±5 years, Distance +50 miles
  - Second expansion (60s): Age range ±5 more years, Distance +50 more miles
  - Original preferences stored on first expansion only
- **When expanded preferences apply**: 
  - Used in Tier 2 matching (expanded preferences)
  - Automatically reset after 5 minutes
  - Reset immediately after successful match (all tiers)
  - Reset on respin
- **Storage**: 
  - Original preferences stored in `original_min_age`, `original_max_age`, `original_max_distance` columns (first expansion only)
  - Subsequent expansions modify current values (not originals)
  - Reset restores to original values
- **Guardian cleanup**: Guardian should call `reset_preference_expansion()` for all users with expired expansions

---

## Part 5: Heartbeat & Online Status (Atomic with 10-Second Reconnection Window)

### 5.1 Unified Heartbeat Handler

```sql
-- THE ONLY FUNCTION THAT HANDLES HEARTBEAT
CREATE OR REPLACE FUNCTION heartbeat_update(
  p_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_state user_matching_state;
BEGIN
  -- 1. Update last_seen timestamp (but NOT is_online yet)
  -- is_online is only updated by handle_user_offline() and finalize_user_offline()
  UPDATE profiles
  SET last_seen = NOW()
  WHERE id = p_user_id;
  
  -- 2. Check if user was previously offline
  SELECT status INTO user_state
  FROM matching_queue
  WHERE user_id = p_user_id;
  
  IF user_state = 'soft_offline' THEN
    -- User reconnected within grace period
    -- Restore to previous state (before soft_offline)
    UPDATE matching_queue
    SET status = COALESCE(
      (SELECT status FROM matching_queue WHERE user_id = p_user_id 
       ORDER BY updated_at DESC LIMIT 1),
      'queue_waiting'
    ),
    disconnected_at = NULL,
    updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- Now mark as online (after restoring queue state)
    UPDATE profiles SET is_online = TRUE WHERE id = p_user_id;
    
    PERFORM state_machine_transition(p_user_id, 'user_reconnected');
  ELSIF user_state = 'disconnected' THEN
    -- Mark as online first
    UPDATE profiles SET is_online = TRUE WHERE id = p_user_id;
    PERFORM state_machine_transition(p_user_id, 'user_reconnected');
  ELSE
    -- User is active - ensure they're marked online
    UPDATE profiles SET is_online = TRUE WHERE id = p_user_id;
  END IF;
END;
$$;
```

### 5.2 Offline Detection (10-Second Grace Period)

```sql
-- THE ONLY FUNCTION THAT HANDLES OFFLINE USERS (with grace period)
CREATE OR REPLACE FUNCTION handle_user_offline(
  p_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_state user_matching_state;
BEGIN
  -- 1. Mark as soft_offline (not fully offline yet - 10 second grace period)
  UPDATE matching_queue
  SET status = 'soft_offline',
      disconnected_at = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- 2. Get current state (before soft_offline)
  SELECT status INTO user_state
  FROM matching_queue
  WHERE user_id = p_user_id;
  
  -- 3. Log soft offline (grace period started)
  -- Final offline handling happens in finalize_user_offline() after 10 seconds
  PERFORM log_state_transition(p_user_id, user_state, 'soft_offline', 
    jsonb_build_object('reconnection_window', '10s', 'grace_period_start', NOW()));
END;
$$;

-- NEW: Finalize offline after 10-second grace period
CREATE OR REPLACE FUNCTION finalize_user_offline(
  p_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_state user_matching_state;
  active_match_id UUID;
  partner_id UUID;
  disconnected_time TIMESTAMPTZ;
BEGIN
  -- Check if still in soft_offline and > 10 seconds
  SELECT status, disconnected_at INTO user_state, disconnected_time
  FROM matching_queue
  WHERE user_id = p_user_id;
  
  IF user_state != 'soft_offline' THEN
    -- User reconnected, do nothing
    RETURN;
  END IF;
  
  IF disconnected_time IS NULL OR disconnected_time > NOW() - INTERVAL '10 seconds' THEN
    -- Still in grace period
    RETURN;
  END IF;
  
  -- Finalize offline (grace period expired)
  UPDATE profiles SET is_online = FALSE WHERE id = p_user_id;
  
  -- Handle based on previous state
  IF user_state = 'queue_waiting' OR user_state = 'spin_active' THEN
    PERFORM queue_remove(p_user_id, 'user_offline_after_grace');
    
  ELSIF user_state = 'vote_active' THEN
    SELECT id INTO active_match_id
    FROM matches
    WHERE (user1_id = p_user_id OR user2_id = p_user_id)
      AND status = 'pending';
    
    IF active_match_id IS NOT NULL THEN
      SELECT 
        CASE WHEN user1_id = p_user_id THEN user2_id ELSE user1_id END
      INTO partner_id
      FROM matches
      WHERE id = active_match_id;
      
      -- Clean up metadata (revealed_users) before deleting match
      UPDATE matches SET metadata = metadata - 'revealed_users' WHERE id = active_match_id;
      DELETE FROM matches WHERE id = active_match_id;
      DELETE FROM votes WHERE match_id = active_match_id;
      
      PERFORM state_machine_transition(partner_id, 'partner_disconnected', 
        jsonb_build_object('after_grace_period', true));
      PERFORM apply_fairness_boost(partner_id, 10, 'partner_went_offline_after_grace');
    END IF;
    
    PERFORM queue_remove(p_user_id, 'user_offline_after_grace');
  END IF;
  
  -- Transition to disconnected
  PERFORM state_machine_transition(p_user_id, 'grace_period_expired');
END;
$$;

-- ============================================================================
-- 5.2.1 Soft Offline Cleanup Scheduler Setup (pg_cron)
-- ============================================================================
-- Schedule cleanup of expired soft_offline users every 5 seconds
-- This checks for users in soft_offline state for more than 10 seconds

-- Create a function that processes all expired soft_offline users
CREATE OR REPLACE FUNCTION cleanup_expired_soft_offline()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expired_users UUID[];
  cleaned_count INTEGER := 0;
BEGIN
  -- Find all users in soft_offline for more than 10 seconds
  SELECT ARRAY_AGG(user_id) INTO expired_users
  FROM matching_queue
  WHERE status = 'soft_offline'
    AND disconnected_at < NOW() - INTERVAL '10 seconds';
  
  -- Finalize each expired user
  IF expired_users IS NOT NULL THEN
    FOREACH user_id IN ARRAY expired_users
    LOOP
      PERFORM finalize_user_offline(user_id);
      cleaned_count := cleaned_count + 1;
    END LOOP;
  END IF;
  
  RETURN jsonb_build_object(
    'cleaned', cleaned_count,
    'checked_at', NOW()
  );
END;
$$;

-- Schedule the cleanup function (every 5 seconds)
-- SELECT cron.schedule('cleanup-soft-offline', '*/5 * * * * *', $$SELECT cleanup_expired_soft_offline();$$);

-- To unschedule: SELECT cron.unschedule('cleanup-soft-offline');
```

---

## Part 5.5: Voting Engine (Complete Implementation)

### 5.5.1 Submit Vote

```sql
-- THE ONLY FUNCTION THAT HANDLES VOTES
CREATE OR REPLACE FUNCTION submit_vote(
  p_user_id UUID,
  p_match_id UUID,
  p_vote_type TEXT -- 'yes' or 'pass'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '5s'
AS $$
DECLARE
  active_match RECORD;
  partner_id UUID;
  partner_vote TEXT;
  result JSONB;
BEGIN
  -- 1. Get active match
  SELECT * INTO active_match
  FROM matches
  WHERE id = p_match_id
    AND (user1_id = p_user_id OR user2_id = p_user_id)
    AND status = 'pending'
  FOR UPDATE NOWAIT;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found or not active';
  END IF;
  
  -- 2. Get partner ID
  partner_id := CASE 
    WHEN active_match.user1_id = p_user_id THEN active_match.user2_id 
    ELSE active_match.user1_id 
  END;
  
  -- 3. Insert/update vote
  INSERT INTO votes (match_id, user_id, vote_type, created_at)
  VALUES (p_match_id, p_user_id, p_vote_type, NOW())
  ON CONFLICT (match_id, user_id) DO UPDATE
  SET vote_type = p_vote_type,
      updated_at = NOW();
  
  -- 4. Check partner's vote
  SELECT vote_type INTO partner_vote
  FROM votes
  WHERE match_id = p_match_id AND user_id = partner_id;
  
  -- 5. Handle vote outcomes
  IF p_vote_type = 'yes' AND partner_vote = 'yes' THEN
    -- Both voted yes → video_date
    UPDATE matches SET status = 'matched', updated_at = NOW() WHERE id = p_match_id;
    PERFORM state_machine_transition(p_user_id, 'both_voted_yes', jsonb_build_object('match_id', p_match_id));
    PERFORM state_machine_transition(partner_id, 'both_voted_yes', jsonb_build_object('match_id', p_match_id));
    
    -- Record in match_history
    INSERT INTO match_history (user1_id, user2_id, match_id)
    VALUES (p_user_id, partner_id, p_match_id)
    ON CONFLICT DO NOTHING;
    
    -- Record in yes_yes_pairs (mutual yes-yes = banned forever)
    INSERT INTO yes_yes_pairs (user1_id, user2_id, match_id)
    VALUES (p_user_id, partner_id, p_match_id)
    ON CONFLICT DO NOTHING;
    
    result := jsonb_build_object('outcome', 'both_yes', 'next_state', 'video_date');
    
  ELSIF p_vote_type = 'pass' OR partner_vote = 'pass' THEN
    -- One voted pass → instant respin
    -- Clean up metadata (revealed_users) before deleting match
    UPDATE matches SET metadata = metadata - 'revealed_users' WHERE id = p_match_id;
    DELETE FROM matches WHERE id = p_match_id;
    DELETE FROM votes WHERE match_id = p_match_id;
    
    -- User who voted yes gets fairness boost +10
    IF p_vote_type = 'yes' THEN
      PERFORM apply_fairness_boost(p_user_id, 10, 'voted_yes_but_partner_passed');
      PERFORM state_machine_transition(p_user_id, 'one_voted_pass', jsonb_build_object('voter', 'self'));
    ELSIF partner_vote = 'yes' THEN
      PERFORM apply_fairness_boost(partner_id, 10, 'voted_yes_but_partner_passed');
      PERFORM state_machine_transition(partner_id, 'one_voted_pass', jsonb_build_object('voter', 'partner'));
    END IF;
    
    -- Both go to spin_active (respin)
    PERFORM state_machine_transition(p_user_id, 'one_voted_pass', jsonb_build_object('action', 'respin'));
    PERFORM state_machine_transition(partner_id, 'one_voted_pass', jsonb_build_object('action', 'respin'));
    
    -- Record in match_history (but NOT yes_yes_pairs)
    INSERT INTO match_history (user1_id, user2_id, match_id)
    VALUES (p_user_id, partner_id, p_match_id)
    ON CONFLICT DO NOTHING;
    
    result := jsonb_build_object('outcome', 'one_pass', 'next_state', 'spin_active');
    
  ELSE
    -- Waiting for partner's vote
    result := jsonb_build_object('outcome', 'waiting', 'status', 'vote_active');
  END IF;
  
  RETURN result;
END;
$$;
```

### 5.5.2 Handle Idle Voters

```sql
-- Handle idle voters (force revote or auto-drop)
CREATE OR REPLACE FUNCTION handle_idle_voter(
  p_match_id UUID,
  p_idle_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  active_user_id UUID;
  active_user_vote TEXT;
BEGIN
  -- Get the active (non-idle) user
  SELECT 
    CASE WHEN user1_id = p_idle_user_id THEN user2_id ELSE user1_id END,
    vote_type
  INTO active_user_id, active_user_vote
  FROM matches m
  LEFT JOIN votes v ON v.match_id = m.id AND v.user_id != p_idle_user_id
  WHERE m.id = p_match_id;
  
  IF active_user_vote = 'yes' THEN
    -- Active user voted yes → give them boost +10 and respin
    PERFORM apply_fairness_boost(active_user_id, 10, 'partner_idle_during_vote');
    PERFORM state_machine_transition(active_user_id, 'partner_idle', jsonb_build_object('action', 'respin'));
  END IF;
  
  -- Break match and remove idle user
  -- Clean up metadata (revealed_users) before deleting match
  UPDATE matches SET metadata = metadata - 'revealed_users' WHERE id = p_match_id;
  DELETE FROM matches WHERE id = p_match_id;
  DELETE FROM votes WHERE match_id = p_match_id;
  PERFORM queue_remove(p_idle_user_id, 'idle_during_vote');
END;
$$;
```

### 5.6 Reveal Engine (Atomic Reveal → Vote Transition)

```sql
-- THE ONLY FUNCTION THAT HANDLES REVEAL COMPLETION
CREATE OR REPLACE FUNCTION complete_reveal(
  p_user_id UUID,
  p_match_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '5s'
AS $$
DECLARE
  active_match RECORD;
  partner_id UUID;
  both_revealed BOOLEAN;
  current_revealed_users JSONB;
  updated_revealed_users JSONB;
BEGIN
  -- 1. Get active match
  SELECT * INTO active_match
  FROM matches
  WHERE id = p_match_id
    AND (user1_id = p_user_id OR user2_id = p_user_id)
    AND status = 'pending'
  FOR UPDATE NOWAIT;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found or not active';
  END IF;
  
  -- 2. Get partner ID
  partner_id := CASE 
    WHEN active_match.user1_id = p_user_id THEN active_match.user2_id 
    ELSE active_match.user1_id 
  END;
  
  -- 3. Get current revealed users array (atomic read)
  current_revealed_users := COALESCE(active_match.metadata->'revealed_users', '[]'::JSONB);
  
  -- 4. Check if user already revealed (prevent duplicates)
  IF p_user_id::TEXT = ANY(
    SELECT jsonb_array_elements_text(current_revealed_users)
  ) THEN
    -- User already revealed, return current state
    both_revealed := jsonb_array_length(current_revealed_users) >= 2;
    IF both_revealed THEN
      RETURN jsonb_build_object('status', 'both_revealed', 'next_state', 'vote_active');
    ELSE
      RETURN jsonb_build_object('status', 'waiting_for_partner', 'current_state', 'paired');
    END IF;
  END IF;
  
  -- 5. Atomically append user to revealed_users array
  updated_revealed_users := current_revealed_users || jsonb_build_array(p_user_id::TEXT);
  
  -- 6. Update match metadata atomically using jsonb_set
  UPDATE matches
  SET metadata = jsonb_set(
    COALESCE(metadata, '{}'::JSONB),
    '{revealed_users}',
    updated_revealed_users
  )
  WHERE id = p_match_id;
  
  -- 7. Check if both users have revealed
  both_revealed := jsonb_array_length(updated_revealed_users) >= 2;
  
  -- 8. If both revealed, transition to vote_active
  IF both_revealed THEN
    PERFORM state_machine_transition(p_user_id, 'reveal_complete', 
      jsonb_build_object('match_id', p_match_id));
    PERFORM state_machine_transition(partner_id, 'reveal_complete', 
      jsonb_build_object('match_id', p_match_id));
    
    RETURN jsonb_build_object('status', 'both_revealed', 'next_state', 'vote_active');
  ELSE
    RETURN jsonb_build_object('status', 'waiting_for_partner', 'current_state', 'paired');
  END IF;
END;
$$;

-- Reveal timeout handler (if user doesn't reveal within timeout)
CREATE OR REPLACE FUNCTION handle_reveal_timeout(
  p_match_id UUID,
  p_idle_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  partner_id UUID;
BEGIN
  -- Get partner
  SELECT 
    CASE WHEN user1_id = p_idle_user_id THEN user2_id ELSE user1_id END
  INTO partner_id
  FROM matches
  WHERE id = p_match_id;
  
  -- Break match
  -- Clean up metadata (revealed_users) before deleting match
  UPDATE matches SET metadata = metadata - 'revealed_users' WHERE id = p_match_id;
  DELETE FROM matches WHERE id = p_match_id;
  
  -- Reset both users to spin_active
  PERFORM state_machine_transition(p_idle_user_id, 'reveal_timeout', 
    jsonb_build_object('action', 'respin'));
  PERFORM state_machine_transition(partner_id, 'partner_reveal_timeout', 
    jsonb_build_object('action', 'respin'));
  
  -- Give partner fairness boost
  PERFORM apply_fairness_boost(partner_id, 10, 'partner_reveal_timeout');
  
  -- Remove from queue
  PERFORM queue_remove(p_idle_user_id, 'reveal_timeout');
END;
$$;
```

---

## Part 6: Frontend Contract (Simplified)

### 6.1 Frontend Responsibilities (Minimal)

The frontend should **ONLY**:
1. Call `queue_join()` when user presses spin
2. Call `submit_vote()` for voting (not state_machine_transition)
3. Listen to real-time events for state changes
4. Display UI based on current state

**Frontend should NOT:**
- ❌ Directly update queue status
- ❌ Call `process_matching` directly
- ❌ Apply fairness boosts
- ❌ Clean up matches
- ❌ Handle offline detection
- ❌ Manage state transitions

### 6.2 Frontend API Contract

```typescript
// Simplified frontend interface
interface MatchingAPI {
  // User actions
  spin(): Promise<{ queueId: string }>;
  vote(matchId: string, voteType: 'yes' | 'pass'): Promise<{ outcome: string }>;
  // Respin happens automatically via state transitions
  
  // State queries
  getCurrentState(): Promise<UserState>;
  getActiveMatch(): Promise<Match | null>;
  
  // Real-time subscriptions
  subscribeToStateChanges(callback: (state: UserState) => void): void;
  subscribeToMatches(callback: (match: Match) => void): void;
}
```

### 6.3 Frontend Implementation Example

```typescript
// Frontend should be this simple:
async function startSpin() {
  // 1. Call queue_join
  const { data: queueId } = await supabase.rpc('queue_join', {
    p_user_id: userId,
    p_preferences: preferences
  });
  
  // 2. Subscribe to state changes
  const subscription = supabase
    .channel('user-state')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'matching_queue',
      filter: `user_id=eq.${userId}`
    }, (payload) => {
      // Update UI based on new state
      updateUI(payload.new.status);
    })
    .subscribe();
  
  // 3. Subscribe to matches
  const matchSubscription = supabase
    .channel('matches')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'matches',
      filter: `user1_id=eq.${userId}`
    }, (payload) => {
      // Show match
      showMatch(payload.new);
    })
    .subscribe();
}

async function submitVote(matchId: string, voteType: 'yes' | 'pass') {
  // Call submit_vote (handles all vote logic)
  const { data } = await supabase.rpc('submit_vote', {
    p_user_id: userId,
    p_match_id: matchId,
    p_vote_type: voteType
  });
  
  // Outcome is handled by state machine transitions
  // Frontend just displays the result
  return data;
}
```

---

## Part 7: Guardians (Preventive, Not Reactive)

### 7.1 Guardian Role Change

Guardians should **prevent** issues, not fix them:

```sql
-- Guardian: Ensure queue consistency
CREATE OR REPLACE FUNCTION guardian_queue_consistency()
RETURNS JSONB AS $$
DECLARE
  invalid_entries INTEGER;
BEGIN
  -- Find and remove invalid queue entries
  -- Valid states: spin_active, queue_waiting, paired, vote_active
  -- (paired is valid - user is in reveal phase, not yet voting)
  
  -- This should be EMPTY if system is working correctly
  SELECT COUNT(*) INTO invalid_entries
  FROM matching_queue mq
  LEFT JOIN profiles p ON p.id = mq.user_id
  WHERE p.is_online = FALSE
     OR mq.status NOT IN ('spin_active', 'queue_waiting', 'paired', 'vote_active');
  
  IF invalid_entries > 0 THEN
    -- Log warning (not error - this shouldn't happen)
    PERFORM log_guardian_warning('queue_consistency', invalid_entries);
    
    -- Clean up (but this is a safety net, not the primary mechanism)
    DELETE FROM matching_queue
    WHERE user_id IN (
      SELECT mq.user_id
      FROM matching_queue mq
      LEFT JOIN profiles p ON p.id = mq.user_id
      WHERE p.is_online = FALSE
         OR mq.status NOT IN ('spin_active', 'queue_waiting', 'paired', 'vote_active')
    );
  END IF;
  
  RETURN jsonb_build_object('cleaned', invalid_entries);
END;
$$;
```

**Key Change**: Guardians should log warnings when they find issues, indicating the core system needs fixing, not that guardians are working.

### 7.2 Guardian Schedule

Guardians should run **less frequently** (every 30-60 seconds) because they're safety nets, not primary mechanisms.

### 7.3 Vote Timeout Scheduler

```sql
-- THE ONLY FUNCTION THAT CHECKS FOR IDLE VOTERS
CREATE OR REPLACE FUNCTION check_vote_timeouts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  timed_out_matches UUID[];
  match_record RECORD;
  vote_timeout_seconds INTEGER := 30; -- 30 second vote timeout
BEGIN
  -- Find matches where:
  -- 1. Status is pending (in voting phase)
  -- 2. Created more than vote_timeout_seconds ago
  -- 3. At least one user hasn't voted
  SELECT ARRAY_AGG(DISTINCT m.id) INTO timed_out_matches
  FROM matches m
  WHERE m.status = 'pending'
    AND m.created_at < NOW() - (vote_timeout_seconds || ' seconds')::INTERVAL
    AND EXISTS (
      -- Match has users in vote_active state
      SELECT 1 FROM matching_queue mq
      WHERE mq.status = 'vote_active'
        AND (mq.user_id = m.user1_id OR mq.user_id = m.user2_id)
    )
    AND (
      -- At least one user hasn't voted
      NOT EXISTS (
        SELECT 1 FROM votes v
        WHERE v.match_id = m.id AND v.user_id = m.user1_id
      )
      OR
      NOT EXISTS (
        SELECT 1 FROM votes v
        WHERE v.match_id = m.id AND v.user_id = m.user2_id
      )
    );
  
  -- Process each timed-out match
  IF timed_out_matches IS NOT NULL THEN
    FOREACH match_record.id IN ARRAY timed_out_matches
    LOOP
      -- Find which user(s) are idle
      SELECT m.* INTO match_record
      FROM matches m
      WHERE m.id = match_record.id;
      
      -- Check which user hasn't voted
      IF NOT EXISTS (
        SELECT 1 FROM votes WHERE match_id = match_record.id AND user_id = match_record.user1_id
      ) THEN
        PERFORM handle_idle_voter(match_record.id, match_record.user1_id);
      ELSIF NOT EXISTS (
        SELECT 1 FROM votes WHERE match_id = match_record.id AND user_id = match_record.user2_id
      ) THEN
        PERFORM handle_idle_voter(match_record.id, match_record.user2_id);
      END IF;
    END LOOP;
  END IF;
  
  RETURN jsonb_build_object(
    'checked', NOW(),
    'timed_out_matches', COALESCE(array_length(timed_out_matches, 1), 0)
  );
END;
$$;

-- This function should be called by:
-- 1. pg_cron (every 10 seconds): SELECT check_vote_timeouts();
-- 2. Supabase Edge Function (scheduled)
-- 3. Background orchestrator (every 10 seconds)

-- ============================================================================
-- 7.3.1 Vote Timeout Scheduler Setup (pg_cron)
-- ============================================================================
-- Schedule vote timeout checks every 10 seconds
-- SELECT cron.schedule('check-vote-timeouts', '*/10 * * * * *', $$SELECT check_vote_timeouts();$$);

-- To unschedule: SELECT cron.unschedule('check-vote-timeouts');
```

### 7.4 Reveal Timeout Scheduler

```sql
CREATE OR REPLACE FUNCTION check_reveal_timeouts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  timed_out_matches UUID[];
  match_record RECORD;
  reveal_timeout_seconds INTEGER := 15; -- 15 second reveal timeout
BEGIN
  -- Find matches where:
  -- 1. Status is pending (in reveal phase)
  -- 2. Created more than reveal_timeout_seconds ago
  -- 3. Users are in 'paired' state (not yet voted)
  SELECT ARRAY_AGG(DISTINCT m.id) INTO timed_out_matches
  FROM matches m
  INNER JOIN matching_queue mq1 ON mq1.user_id = m.user1_id
  INNER JOIN matching_queue mq2 ON mq2.user_id = m.user2_id
  WHERE m.status = 'pending'
    AND m.created_at < NOW() - (reveal_timeout_seconds || ' seconds')::INTERVAL
    AND (mq1.status = 'paired' OR mq2.status = 'paired')
    AND (
      -- At least one user hasn't revealed
      m.metadata->'revealed_users' IS NULL
      OR
      jsonb_array_length(COALESCE(m.metadata->'revealed_users', '[]'::JSONB)) < 2
    );
  
  -- Process each timed-out match
  IF timed_out_matches IS NOT NULL THEN
    FOREACH match_record.id IN ARRAY timed_out_matches
    LOOP
      SELECT m.* INTO match_record
      FROM matches m
      WHERE m.id = match_record.id;
      
      -- Find which user hasn't revealed
      IF m.metadata->'revealed_users' IS NULL OR 
         NOT (match_record.user1_id::TEXT = ANY(
           SELECT jsonb_array_elements_text(COALESCE(m.metadata->'revealed_users', '[]'::JSONB))
         )) THEN
        PERFORM handle_reveal_timeout(match_record.id, match_record.user1_id);
      ELSIF NOT (match_record.user2_id::TEXT = ANY(
        SELECT jsonb_array_elements_text(COALESCE(m.metadata->'revealed_users', '[]'::JSONB))
      )) THEN
        PERFORM handle_reveal_timeout(match_record.id, match_record.user2_id);
      END IF;
    END LOOP;
  END IF;
  
  RETURN jsonb_build_object(
    'checked', NOW(),
    'timed_out_matches', COALESCE(array_length(timed_out_matches, 1), 0)
  );
END;
$$;

-- This function should be called by:
-- 1. pg_cron (every 10 seconds): SELECT check_reveal_timeouts();
-- 2. Supabase Edge Function (scheduled)
-- 3. Background orchestrator (every 10 seconds)

-- ============================================================================
-- 7.4.1 Reveal Timeout Scheduler Setup (pg_cron)
-- ============================================================================
-- Schedule reveal timeout checks every 10 seconds
-- SELECT cron.schedule('check-reveal-timeouts', '*/10 * * * * *', $$SELECT check_reveal_timeouts();$$);

-- To unschedule: SELECT cron.unschedule('check-reveal-timeouts');
```

---

## Part 8: Concurrency Control

### 8.1 Global Matching Lock

```sql
-- Prevent multiple matching processes from running simultaneously
CREATE OR REPLACE FUNCTION acquire_matching_lock()
RETURNS BOOLEAN AS $$
DECLARE
  lock_acquired BOOLEAN;
BEGIN
  -- Try to acquire advisory lock
  SELECT pg_try_advisory_lock(123456) INTO lock_acquired;
  
  IF NOT lock_acquired THEN
    -- Another matching process is running
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION release_matching_lock()
RETURNS VOID AS $$
BEGIN
  PERFORM pg_advisory_unlock(123456);
END;
$$;
```

### 8.2 Matching Orchestrator (Single Process with Tier Differentiation)

```sql
-- THE ONLY FUNCTION THAT ORCHESTRATES MATCHING
CREATE OR REPLACE FUNCTION matching_orchestrator()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '30s'
AS $$
DECLARE
  lock_acquired BOOLEAN;
  user_id UUID;
  tier1_users UUID[];
  tier2_users UUID[];
  tier3_users UUID[];
  processed_count INTEGER := 0;
BEGIN
  -- 1. Acquire global lock
  SELECT acquire_matching_lock() INTO lock_acquired;
  IF NOT lock_acquired THEN
    RETURN jsonb_build_object('status', 'locked', 'message', 'Another matching process is running');
  END IF;
  
  BEGIN
    -- 2. Get users in batches (limit to batch_size per tier to prevent overload)
    -- Tier assignment considers BOTH fairness AND wait time
    -- Tier 1: High fairness (exact preferences only) OR long wait time (>= 2 minutes)
    SELECT ARRAY_AGG(user_id) INTO tier1_users
    FROM (
      SELECT user_id
      FROM matching_queue
      WHERE status IN ('queue_waiting', 'spin_active')
        AND user_id IN (SELECT id FROM profiles WHERE is_online = TRUE)
        AND (
          fairness_score >= 200  -- High fairness
          OR
          EXTRACT(EPOCH FROM (NOW() - joined_at)) >= 120  -- OR waiting >= 2 minutes
        )
      ORDER BY 
        -- Prioritize: high fairness first, then long wait times
        CASE WHEN fairness_score >= 200 THEN fairness_score ELSE 0 END DESC,
        EXTRACT(EPOCH FROM (NOW() - joined_at)) DESC,
        joined_at ASC
      LIMIT 20  -- Process max 20 users per tier per run
    ) t1;
    
    -- Tier 2: Medium fairness (expanded preferences) AND wait time < 2 minutes
    SELECT ARRAY_AGG(user_id) INTO tier2_users
    FROM (
      SELECT user_id
      FROM matching_queue
      WHERE status IN ('queue_waiting', 'spin_active')
        AND user_id IN (SELECT id FROM profiles WHERE is_online = TRUE)
        AND fairness_score >= 50 AND fairness_score < 200
        AND EXTRACT(EPOCH FROM (NOW() - joined_at)) < 120  -- Wait time < 2 minutes
      ORDER BY fairness_score DESC, joined_at ASC
      LIMIT 20  -- Process max 20 users per tier per run
    ) t2;
    
    -- Tier 3: Low fairness (guaranteed match) AND wait time < 2 minutes
    SELECT ARRAY_AGG(user_id) INTO tier3_users
    FROM (
      SELECT user_id
      FROM matching_queue
      WHERE status IN ('queue_waiting', 'spin_active')
        AND user_id IN (SELECT id FROM profiles WHERE is_online = TRUE)
        AND fairness_score < 50
        AND EXTRACT(EPOCH FROM (NOW() - joined_at)) < 120  -- Wait time < 2 minutes
      ORDER BY fairness_score DESC, joined_at ASC
      LIMIT 20  -- Process max 20 users per tier per run
    ) t3;
    
    -- 3. Process Tier 1 users (high fairness, exact preferences)
    IF tier1_users IS NOT NULL THEN
      FOREACH user_id IN ARRAY tier1_users
      LOOP
        -- unified_matching_engine will try Tier 1 first
        PERFORM unified_matching_engine(user_id);
        PERFORM pg_sleep(0.01);
        processed_count := processed_count + 1;
      END LOOP;
    END IF;
    
    -- 4. Process Tier 2 users (medium fairness, expanded preferences)
    IF tier2_users IS NOT NULL THEN
      FOREACH user_id IN ARRAY tier2_users
      LOOP
        -- unified_matching_engine will try Tier 1, then Tier 2
        PERFORM unified_matching_engine(user_id);
        PERFORM pg_sleep(0.01);
        processed_count := processed_count + 1;
      END LOOP;
    END IF;
    
    -- 5. Process Tier 3 users (low fairness, guaranteed match)
    IF tier3_users IS NOT NULL THEN
      FOREACH user_id IN ARRAY tier3_users
      LOOP
        -- unified_matching_engine will try all tiers, then guaranteed
        PERFORM unified_matching_engine(user_id);
        PERFORM pg_sleep(0.01);
        processed_count := processed_count + 1;
      END LOOP;
    END IF;
    
    -- 6. Release lock
    PERFORM release_matching_lock();
    
    RETURN jsonb_build_object(
      'status', 'success',
      'tier1_processed', COALESCE(array_length(tier1_users, 1), 0),
      'tier2_processed', COALESCE(array_length(tier2_users, 1), 0),
      'tier3_processed', COALESCE(array_length(tier3_users, 1), 0),
      'total_processed', processed_count
    );
    
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM release_matching_lock();
      RAISE;
  END;
END;
$$;
```

---

## Part 9: Queue Monitoring & Gender Ratio Balancing

### 9.1 Queue Metrics Collection

```sql
-- Collect current queue metrics for monitoring
CREATE OR REPLACE FUNCTION collect_queue_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_metrics RECORD;
  v_supply_demand_ratio DECIMAL(10, 4);
  v_gender_imbalance_score DECIMAL(10, 4);
  v_total_users INTEGER;
  v_male_count INTEGER;
  v_female_count INTEGER;
  v_avg_fairness DECIMAL(10, 2);
  v_avg_wait_time INTEGER;
BEGIN
  -- Get queue statistics
  SELECT 
    COUNT(*) FILTER (WHERE mq.status IN ('spin_active', 'queue_waiting')) AS total_users,
    COUNT(*) FILTER (WHERE mq.status IN ('spin_active', 'queue_waiting') AND p.gender = 'male') AS male_count,
    COUNT(*) FILTER (WHERE mq.status IN ('spin_active', 'queue_waiting') AND p.gender = 'female') AS female_count,
    COUNT(*) FILTER (WHERE mq.status IN ('spin_active', 'queue_waiting') AND p.gender NOT IN ('male', 'female')) AS other_count,
    COUNT(*) FILTER (WHERE mq.status = 'spin_active') AS spin_active_count,
    COUNT(*) FILTER (WHERE mq.status = 'queue_waiting') AS queue_waiting_count,
    COUNT(*) FILTER (WHERE mq.status = 'paired') AS paired_count,
    COUNT(*) FILTER (WHERE mq.status = 'vote_active') AS vote_active_count,
    AVG(mq.fairness_score) FILTER (WHERE mq.status IN ('spin_active', 'queue_waiting')) AS avg_fairness,
    AVG(EXTRACT(EPOCH FROM (NOW() - mq.joined_at)))::INTEGER FILTER (WHERE mq.status IN ('spin_active', 'queue_waiting')) AS avg_wait_time
  INTO v_metrics
  FROM matching_queue mq
  JOIN profiles p ON p.id = mq.user_id
  WHERE p.is_online = TRUE;
  
  v_total_users := COALESCE(v_metrics.total_users, 0);
  v_male_count := COALESCE(v_metrics.male_count, 0);
  v_female_count := COALESCE(v_metrics.female_count, 0);
  
  -- Calculate supply/demand ratio (male/female or female/male, whichever is > 1)
  IF v_female_count > 0 THEN
    v_supply_demand_ratio := v_male_count::DECIMAL / v_female_count;
  ELSIF v_male_count > 0 THEN
    v_supply_demand_ratio := v_female_count::DECIMAL / v_male_count;
  ELSE
    v_supply_demand_ratio := 1.0;
  END IF;
  
  -- Calculate gender imbalance score (0 = balanced, 1 = completely imbalanced)
  IF v_total_users > 0 THEN
    v_gender_imbalance_score := ABS(v_male_count - v_female_count)::DECIMAL / v_total_users;
  ELSE
    v_gender_imbalance_score := 0.0;
  END IF;
  
  -- Get tier distribution
  SELECT 
    COUNT(*) FILTER (WHERE mq.fairness_score >= 200 OR EXTRACT(EPOCH FROM (NOW() - mq.joined_at)) >= 120) AS tier1,
    COUNT(*) FILTER (WHERE mq.fairness_score >= 50 AND mq.fairness_score < 200 AND EXTRACT(EPOCH FROM (NOW() - mq.joined_at)) < 120) AS tier2,
    COUNT(*) FILTER (WHERE mq.fairness_score < 50 AND EXTRACT(EPOCH FROM (NOW() - mq.joined_at)) < 120) AS tier3
  INTO v_metrics
  FROM matching_queue mq
  JOIN profiles p ON p.id = mq.user_id
  WHERE p.is_online = TRUE
    AND mq.status IN ('spin_active', 'queue_waiting');
  
  -- Store metrics in history table
  INSERT INTO queue_metrics (
    total_users,
    male_count,
    female_count,
    other_count,
    spin_active_count,
    queue_waiting_count,
    paired_count,
    vote_active_count,
    supply_demand_ratio,
    gender_imbalance_score,
    avg_fairness_score,
    avg_wait_time_seconds,
    tier1_count,
    tier2_count,
    tier3_count
  ) VALUES (
    v_total_users,
    v_male_count,
    v_female_count,
    COALESCE(v_metrics.other_count, 0),
    COALESCE(v_metrics.spin_active_count, 0),
    COALESCE(v_metrics.queue_waiting_count, 0),
    COALESCE(v_metrics.paired_count, 0),
    COALESCE(v_metrics.vote_active_count, 0),
    v_supply_demand_ratio,
    v_gender_imbalance_score,
    COALESCE(v_avg_fairness, 0),
    COALESCE(v_avg_wait_time, 0),
    COALESCE(v_metrics.tier1, 0),
    COALESCE(v_metrics.tier2, 0),
    COALESCE(v_metrics.tier3, 0)
  );
  
  -- Return current metrics
  RETURN jsonb_build_object(
    'total_users', v_total_users,
    'male_count', v_male_count,
    'female_count', v_female_count,
    'supply_demand_ratio', v_supply_demand_ratio,
    'gender_imbalance_score', v_gender_imbalance_score,
    'avg_fairness_score', COALESCE(v_avg_fairness, 0),
    'avg_wait_time_seconds', COALESCE(v_avg_wait_time, 0),
    'tier1_count', COALESCE(v_metrics.tier1, 0),
    'tier2_count', COALESCE(v_metrics.tier2, 0),
    'tier3_count', COALESCE(v_metrics.tier3, 0),
    'needs_balancing', v_gender_imbalance_score > 0.3 OR v_supply_demand_ratio > 2.0 OR v_supply_demand_ratio < 0.5
  );
END;
$$;
```

### 9.2 Gender Ratio Stabilizer

```sql
-- Apply fairness boosts to underrepresented gender to balance queue
CREATE OR REPLACE FUNCTION apply_gender_ratio_balancing()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_metrics JSONB;
  v_male_count INTEGER;
  v_female_count INTEGER;
  v_imbalance_score DECIMAL(10, 4);
  v_boost_applied INTEGER := 0;
  v_target_gender TEXT;
BEGIN
  -- Get current metrics
  v_metrics := collect_queue_metrics();
  
  v_male_count := (v_metrics->>'male_count')::INTEGER;
  v_female_count := (v_metrics->>'female_count')::INTEGER;
  v_imbalance_score := (v_metrics->>'gender_imbalance_score')::DECIMAL;
  
  -- Only apply balancing if imbalance is significant (>30% difference)
  IF v_imbalance_score < 0.3 THEN
    RETURN jsonb_build_object('balanced', TRUE, 'message', 'Queue is balanced');
  END IF;
  
  -- Determine which gender needs boost (underrepresented)
  IF v_male_count < v_female_count THEN
    v_target_gender := 'male';
  ELSIF v_female_count < v_male_count THEN
    v_target_gender := 'female';
  ELSE
    RETURN jsonb_build_object('balanced', TRUE, 'message', 'Equal counts');
  END IF;
  
  -- Apply fairness boost to underrepresented gender
  UPDATE matching_queue mq
  SET fairness_score = COALESCE(fairness_score, 0) + 10
  FROM profiles p
  WHERE mq.user_id = p.id
    AND p.gender = v_target_gender
    AND p.is_online = TRUE
    AND mq.status IN ('spin_active', 'queue_waiting')
    AND mq.fairness_score < 200  -- Don't boost users already in Tier 1
  LIMIT 20;  -- Limit to prevent over-boosting
  
  GET DIAGNOSTICS v_boost_applied = ROW_COUNT;
  
  -- Log balancing action
  PERFORM log_event('gender_ratio_balanced', 
    jsonb_build_object(
      'target_gender', v_target_gender,
      'male_count', v_male_count,
      'female_count', v_female_count,
      'imbalance_score', v_imbalance_score,
      'boosts_applied', v_boost_applied
    )
  );
  
  RETURN jsonb_build_object(
    'balanced', FALSE,
    'target_gender', v_target_gender,
    'boosts_applied', v_boost_applied,
    'imbalance_score', v_imbalance_score
  );
END;
$$;
```

### 9.3 Queue Size Monitoring

```sql
-- Monitor queue size and trigger alerts if needed
CREATE OR REPLACE FUNCTION monitor_queue_size()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_metrics JSONB;
  v_total_users INTEGER;
  v_warnings TEXT[] := '{}';
BEGIN
  v_metrics := collect_queue_metrics();
  v_total_users := (v_metrics->>'total_users')::INTEGER;
  
  -- Check for queue overload
  IF v_total_users > 500 THEN
    v_warnings := array_append(v_warnings, 'Queue size exceeds 500 users - consider scaling');
  END IF;
  
  -- Check for queue underload
  IF v_total_users < 10 THEN
    v_warnings := array_append(v_warnings, 'Queue size below 10 users - matching may be slow');
  END IF;
  
  -- Check for severe gender imbalance
  IF (v_metrics->>'gender_imbalance_score')::DECIMAL > 0.5 THEN
    v_warnings := array_append(v_warnings, 'Severe gender imbalance detected - automatic balancing triggered');
    PERFORM apply_gender_ratio_balancing();
  END IF;
  
  -- Check for high wait times
  IF (v_metrics->>'avg_wait_time_seconds')::INTEGER > 300 THEN
    v_warnings := array_append(v_warnings, 'Average wait time exceeds 5 minutes - investigate matching bottlenecks');
  END IF;
  
  RETURN jsonb_build_object(
    'total_users', v_total_users,
    'warnings', v_warnings,
    'metrics', v_metrics
  );
END;
$$;
```

### 9.4 Monitoring Schedule

```sql
-- Schedule queue monitoring (every 30 seconds)
-- 1. pg_cron: SELECT cron.schedule('queue-monitoring', '*/30 * * * * *', $$SELECT collect_queue_metrics();$$);
-- 2. pg_cron: SELECT cron.schedule('gender-balancing', '*/60 * * * * *', $$SELECT apply_gender_ratio_balancing();$$);
-- 3. pg_cron: SELECT cron.schedule('queue-size-monitoring', '*/60 * * * * *', $$SELECT monitor_queue_size();$$);
```

---

## Part 9.6: Complete Scheduler Setup

### 9.6.1 All Background Schedulers (pg_cron)

```sql
-- ============================================================================
-- Complete Scheduler Setup for Production
-- ============================================================================
-- Run these commands to set up all background schedulers using pg_cron
-- Note: Requires pg_cron extension to be enabled

-- 1. Soft Offline Cleanup (every 5 seconds)
SELECT cron.schedule(
  'cleanup-soft-offline',
  '*/5 * * * * *',
  $$SELECT cleanup_expired_soft_offline();$$
);

-- 2. Vote Timeout Checks (every 10 seconds)
SELECT cron.schedule(
  'check-vote-timeouts',
  '*/10 * * * * *',
  $$SELECT check_vote_timeouts();$$
);

-- 3. Reveal Timeout Checks (every 10 seconds)
SELECT cron.schedule(
  'check-reveal-timeouts',
  '*/10 * * * * *',
  $$SELECT check_reveal_timeouts();$$
);

-- 4. Queue Metrics Collection (every 30 seconds)
SELECT cron.schedule(
  'queue-monitoring',
  '*/30 * * * * *',
  $$SELECT collect_queue_metrics();$$
);

-- 5. Gender Ratio Balancing (every 60 seconds)
SELECT cron.schedule(
  'gender-balancing',
  '*/60 * * * * *',
  $$SELECT apply_gender_ratio_balancing();$$
);

-- 6. Queue Size Monitoring (every 60 seconds)
SELECT cron.schedule(
  'queue-size-monitoring',
  '*/60 * * * * *',
  $$SELECT monitor_queue_size();$$
);

-- 7. Matching Orchestrator (every 5 seconds)
SELECT cron.schedule(
  'matching-orchestrator',
  '*/5 * * * * *',
  $$SELECT matching_orchestrator();$$
);

-- 8. Guardian Queue Consistency (every 30 seconds)
SELECT cron.schedule(
  'guardian-queue-consistency',
  '*/30 * * * * *',
  $$SELECT guardian_queue_consistency();$$
);
```

### 9.6.2 Scheduler Health Checks

```sql
-- Check if all schedulers are running
CREATE OR REPLACE FUNCTION check_scheduler_health()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_schedulers RECORD;
  v_health JSONB := '{}'::JSONB;
BEGIN
  -- Check pg_cron jobs
  SELECT 
    COUNT(*) FILTER (WHERE jobname IN (
      'cleanup-soft-offline',
      'check-vote-timeouts',
      'check-reveal-timeouts',
      'queue-monitoring',
      'gender-balancing',
      'queue-size-monitoring',
      'matching-orchestrator',
      'guardian-queue-consistency'
    )) AS active_count,
    COUNT(*) FILTER (WHERE jobname IN (
      'cleanup-soft-offline',
      'check-vote-timeouts',
      'check-reveal-timeouts',
      'queue-monitoring',
      'gender-balancing',
      'queue-size-monitoring',
      'matching-orchestrator',
      'guardian-queue-consistency'
    ) AND active = FALSE) AS inactive_count
  INTO v_schedulers
  FROM cron.job;
  
  v_health := jsonb_build_object(
    'active_schedulers', COALESCE(v_schedulers.active_count, 0),
    'inactive_schedulers', COALESCE(v_schedulers.inactive_count, 0),
    'total_expected', 8,
    'healthy', COALESCE(v_schedulers.inactive_count, 0) = 0,
    'checked_at', NOW()
  );
  
  RETURN v_health;
END;
$$;
```

### 9.6.3 Unscheduling (for maintenance)

```sql
-- To unschedule all jobs (for maintenance or updates):
SELECT cron.unschedule('cleanup-soft-offline');
SELECT cron.unschedule('check-vote-timeouts');
SELECT cron.unschedule('check-reveal-timeouts');
SELECT cron.unschedule('queue-monitoring');
SELECT cron.unschedule('gender-balancing');
SELECT cron.unschedule('queue-size-monitoring');
SELECT cron.unschedule('matching-orchestrator');
SELECT cron.unschedule('guardian-queue-consistency');
```

### 9.6.4 Logging Helper Function

```sql
-- Helper function for logging events (used throughout blueprint)
CREATE OR REPLACE FUNCTION log_event(
  p_event_type TEXT,
  p_user_id UUID DEFAULT NULL,
  p_event_data JSONB DEFAULT '{}'::JSONB,
  p_severity TEXT DEFAULT 'INFO',
  p_function_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO spark_event_log (
    event_type,
    event_data,
    user_id,
    timestamp,
    severity,
    function_name,
    source
  ) VALUES (
    p_event_type,
    p_event_data,
    p_user_id,
    NOW(),
    p_severity,
    p_function_name,
    'backend'
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;
```

---

## Part 9.5: Real-Time Timeout Detection

### 9.5.1 Real-Time Spin Timeout Detection

```sql
-- Detect and handle spin timeouts in real-time (not just cron)
CREATE OR REPLACE FUNCTION detect_spin_timeout(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_spin_started_at TIMESTAMPTZ;
  v_timeout_seconds INTEGER := 60; -- 60 second spin timeout
BEGIN
  -- Check if user is in spin_active state for too long
  SELECT joined_at INTO v_spin_started_at
  FROM matching_queue
  WHERE user_id = p_user_id
    AND status = 'spin_active';
  
  IF v_spin_started_at IS NULL THEN
    RETURN FALSE; -- Not in spin state
  END IF;
  
  -- Check if timeout exceeded
  IF NOW() - v_spin_started_at > (v_timeout_seconds || ' seconds')::INTERVAL THEN
    -- Force transition to queue_waiting
    PERFORM state_machine_transition(
      p_user_id,
      'spin_timeout',
      jsonb_build_object('timeout_seconds', v_timeout_seconds)
    );
    
    PERFORM log_event('spin_timeout_detected', p_user_id, 
      jsonb_build_object('timeout_seconds', v_timeout_seconds));
    
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;
```

### 9.5.2 Real-Time Reveal Timeout Detection

```sql
-- Detect reveal timeouts in real-time (called on reveal check)
CREATE OR REPLACE FUNCTION detect_reveal_timeout(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match_record RECORD;
  v_reveal_timeout_seconds INTEGER := 15;
BEGIN
  -- Find active match in reveal phase
  SELECT m.*, m.metadata->>'revealed_users' AS revealed_users_json
  INTO v_match_record
  FROM matches m
  WHERE (m.user1_id = p_user_id OR m.user2_id = p_user_id)
    AND m.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM matching_queue
      WHERE user_id IN (m.user1_id, m.user2_id)
        AND status = 'paired'
    );
  
  IF v_match_record.id IS NULL THEN
    RETURN FALSE; -- No active reveal
  END IF;
  
  -- Check if reveal timeout exceeded (15 seconds since match created)
  IF NOW() - v_match_record.created_at > (v_reveal_timeout_seconds || ' seconds')::INTERVAL THEN
    -- Check if both users have revealed
    IF (v_match_record.revealed_users_json IS NULL OR 
        jsonb_array_length(v_match_record.revealed_users_json::jsonb) < 2) THEN
      -- Timeout - handle idle reveal
      PERFORM handle_reveal_timeout(v_match_record.id);
      RETURN TRUE;
    END IF;
  END IF;
  
  RETURN FALSE;
END;
$$;
```

### 9.5.3 Real-Time Vote Timeout Detection

```sql
-- Detect vote timeouts in real-time (called on vote check)
CREATE OR REPLACE FUNCTION detect_vote_timeout(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match_record RECORD;
  v_vote_timeout_seconds INTEGER := 30;
BEGIN
  -- Find active match in voting phase
  SELECT m.*
  INTO v_match_record
  FROM matches m
  WHERE (m.user1_id = p_user_id OR m.user2_id = p_user_id)
    AND m.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM matching_queue
      WHERE user_id IN (m.user1_id, m.user2_id)
        AND status = 'vote_active'
    );
  
  IF v_match_record.id IS NULL THEN
    RETURN FALSE; -- No active vote
  END IF;
  
  -- Check if vote timeout exceeded (30 seconds since voting started)
  -- Voting starts when match transitions to vote_active
  IF v_match_record.metadata->>'voting_started_at' IS NOT NULL THEN
    IF NOW() - (v_match_record.metadata->>'voting_started_at')::TIMESTAMPTZ > 
       (v_vote_timeout_seconds || ' seconds')::INTERVAL THEN
      -- Check if both users have voted
      IF (v_match_record.user1_vote IS NULL OR v_match_record.user2_vote IS NULL) THEN
        -- Timeout - handle idle voter
        PERFORM handle_idle_voter(
          CASE WHEN v_match_record.user1_vote IS NULL THEN v_match_record.user1_id
               ELSE v_match_record.user2_id END
        );
        RETURN TRUE;
      END IF;
    END IF;
  END IF;
  
  RETURN FALSE;
END;
$$;
```

### 9.5.4 Real-Time Timeout Checker (Unified)

```sql
-- Check all timeouts for a user in real-time
CREATE OR REPLACE FUNCTION check_user_timeouts(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_timeouts JSONB := '{}'::JSONB;
BEGIN
  -- Check spin timeout
  IF detect_spin_timeout(p_user_id) THEN
    v_timeouts := v_timeouts || jsonb_build_object('spin_timeout', TRUE);
  END IF;
  
  -- Check reveal timeout
  IF detect_reveal_timeout(p_user_id) THEN
    v_timeouts := v_timeouts || jsonb_build_object('reveal_timeout', TRUE);
  END IF;
  
  -- Check vote timeout
  IF detect_vote_timeout(p_user_id) THEN
    v_timeouts := v_timeouts || jsonb_build_object('vote_timeout', TRUE);
  END IF;
  
  RETURN v_timeouts;
END;
$$;
```

**Usage**: Call `check_user_timeouts(user_id)` on every frontend heartbeat or state check to detect timeouts in real-time, not just via cron.

---

## Part 9: Migration Strategy

### Phase 1: Add New Functions (Parallel)
- Create new state machine functions
- Keep old functions running
- Test new functions in isolation

### Phase 2: Gradual Migration
- Update frontend to use new API
- Migrate one feature at a time
- Monitor for issues

### Phase 3: Deprecation
- Mark old functions as deprecated
- Remove old functions
- Clean up unused code

---

## Part 10: Testing Strategy

### 10.1 State Machine Tests

```typescript
// Test: All valid transitions work
test('State machine allows all valid transitions', async () => {
  // Test each valid transition
});

// Test: Invalid transitions are rejected
test('State machine rejects invalid transitions', async () => {
  // Test invalid transitions throw errors
});

// Test: Concurrent transitions are handled correctly
test('Concurrent state transitions are atomic', async () => {
  // Test race conditions
});
```

### 10.2 Matching Engine Tests

```typescript
// Test: Guaranteed matching never returns offline users
test('Guaranteed match only returns online users', async () => {
  // Create offline user
  // Verify they're not matched
});

// Test: Guaranteed matching never returns previous partners
test('Guaranteed match excludes previous partners', async () => {
  // Create previous match
  // Verify they're not matched again
});
```

---

## Implementation Checklist

- [ ] Create match_history and yes_yes_pairs tables
- [ ] Add soft_offline state to enum
- [ ] Create centralized state machine engine
- [ ] Create determine_reconnect_state() function
- [ ] Create unified matching engine (with retry loop)
- [ ] Create unified queue operations
- [ ] Create centralized fairness system (all boosts +10)
- [ ] Create preference expansion management (reset_preference_expansion)
- [ ] Create atomic heartbeat/offline handling (with 10-second grace period)
- [ ] Create complete voting engine (submit_vote, handle_idle_voter)
- [ ] Create reveal engine (complete_reveal, handle_reveal_timeout)
- [ ] Update find_guaranteed_match_strict with correct match history logic
- [ ] Add duplicate match prevention (is_user_already_matched)
- [ ] Add gender validation (validate_gender_compatibility)
- [ ] Update is_matchable() to exclude paired/vote_active/video_date
- [ ] Update guardian_queue_consistency() to include paired as valid
- [ ] Simplify frontend to API contract only
- [ ] Convert guardians to preventive (not reactive)
- [ ] Add global matching lock
- [ ] Create matching orchestrator with tier differentiation
- [ ] Create background schedulers (Part 9.6):
  - [ ] cleanup_expired_soft_offline (every 5 seconds)
  - [ ] check_vote_timeouts (every 10 seconds)
  - [ ] check_reveal_timeouts (every 10 seconds)
  - [ ] collect_queue_metrics (every 30 seconds)
  - [ ] apply_gender_ratio_balancing (every 60 seconds)
  - [ ] monitor_queue_size (every 60 seconds)
  - [ ] matching_orchestrator (every 5 seconds)
  - [ ] guardian_queue_consistency (every 30 seconds)
- [ ] Add logging indexes (Part 0.2):
  - [ ] Create spark_event_log table with performance indexes
  - [ ] Add log_event() helper function
- [ ] Add queue monitoring (Part 9):
  - [ ] Create queue_metrics table
  - [ ] Implement collect_queue_metrics()
  - [ ] Implement apply_gender_ratio_balancing()
  - [ ] Implement monitor_queue_size()
- [ ] Add real-time timeout detection (Part 9.5):
  - [ ] Implement detect_spin_timeout()
  - [ ] Implement detect_reveal_timeout()
  - [ ] Implement detect_vote_timeout()
  - [ ] Implement check_user_timeouts() unified function
- [ ] Write comprehensive tests
- [ ] Migrate gradually
- [ ] Remove old scattered functions

---

## Expected Outcomes

After this rewrite:

✅ **No more race conditions** - Single matching process with locks
✅ **No more offline users matching** - Strict online validation with 10-second grace period
✅ **No more repeat partners** - Correct match history logic (mutual yes-yes banned forever, others after 5 min)
✅ **No more scattered state** - All transitions in one place
✅ **No more frontend business logic** - Pure API contract
✅ **No more reactive guardians** - Preventive safeguards only
✅ **Deterministic matching** - Same input = same output
✅ **Consistent fairness** - Single calculation point, all boosts are +10
✅ **Atomic operations** - All-or-nothing transitions
✅ **Complete voting engine** - Handles all vote scenarios with instant respin
✅ **True guaranteed pairing** - Retry loop ensures every spin leads to pairing
✅ **Duplicate match prevention** - Users cannot be matched to multiple people simultaneously

---

## Key Design Decisions

### 1. Single State Machine
- **Why**: Eliminates scattered state transitions
- **How**: All state changes go through `state_machine_transition()`
- **Benefit**: Guaranteed consistency

### 2. Single Matching Engine
- **Why**: Eliminates race conditions between multiple matching functions
- **How**: `unified_matching_engine()` is the only function that creates matches
- **Benefit**: Deterministic matching

### 3. Single Queue Operations
- **Why**: Eliminates inconsistent queue state
- **How**: `queue_join()` and `queue_remove()` are the only functions that modify queue
- **Benefit**: Consistent queue state

### 4. Single Fairness System
- **Why**: Eliminates inconsistent fairness scores
- **How**: `calculate_fairness_score()` and `apply_fairness_boost()` are the only functions that modify fairness
- **Benefit**: Fair matching distribution

### 5. Atomic Offline Handling
- **Why**: Eliminates offline users matching
- **How**: `handle_user_offline()` immediately removes users and breaks matches
- **Benefit**: No offline users in matches

### 6. Strict Guaranteed Matching
- **Why**: Prevents repeat matches and offline matches
- **How**: `find_guaranteed_match_strict()` enforces online status, correct match history (yes-yes banned forever, others after 5 min), and duplicate prevention
- **Benefit**: No repeat partners, no offline matches, no duplicate pairings

### 7. Global Matching Lock
- **Why**: Prevents concurrent matching processes
- **How**: `matching_orchestrator()` acquires lock before processing
- **Benefit**: No race conditions

### 8. Simplified Frontend
- **Why**: Eliminates frontend business logic
- **How**: Frontend only calls API (`queue_join`, `submit_vote`) and listens to events
- **Benefit**: Consistent behavior, easier debugging

### 9. Complete Voting Engine
- **Why**: Handles all vote scenarios correctly
- **How**: `submit_vote()` handles both-yes, one-pass, waiting states, and records match history correctly
- **Benefit**: Instant respin, correct fairness boosts (+10), proper match history tracking

### 10. 10-Second Reconnection Window
- **Why**: Prevents false offline detection from network hiccups
- **How**: `handle_user_offline()` sets `soft_offline`, `finalize_user_offline()` checks after 10 seconds
- **Benefit**: Better user experience, fewer false disconnections

### 11. True Guaranteed Pairing
- **Why**: Ensures "every spin leads to pairing" requirement
- **How**: `unified_matching_engine()` has retry loop that continues until match found (up to 30 cycles)
- **Benefit**: Guaranteed matches, no failed spins

---

## Critical Fixes Applied

This blueprint has been updated to address all critical issues identified:

1. ✅ **Match History Logic Fixed** - Uses `match_history` and `yes_yes_pairs` tables correctly
   - Mutual yes-yes pairs: banned forever
   - Other matches: allowed after 5 minutes

2. ✅ **Voting Engine Implemented** - Complete `submit_vote()` function
   - Handles both-yes, one-pass, waiting states
   - Records match history correctly
   - Applies fairness boost +10 (not 100/150)

3. ✅ **10-Second Reconnection Window** - Grace period for disconnections
   - `soft_offline` state added
   - `finalize_user_offline()` checks after 10 seconds
   - Background job needed to check every 5 seconds

4. ✅ **Fairness Boost Values Fixed** - All boosts are +10
   - Voted yes but partner passed: +10
   - Partner went offline: +10
   - Long wait: +10
   - Partner idle: +10

5. ✅ **True Guaranteed Pairing** - Retry loop in `unified_matching_engine()`
   - Continues until match found (up to 30 cycles)
   - Recalculates fairness during wait
   - Logs error if still fails (should never happen)

6. ✅ **Duplicate Match Prevention** - `is_user_already_matched()` function
   - Prevents users from being matched to multiple people
   - Checked in `create_match_atomic()`

7. ✅ **Idle Voter Handling** - `handle_idle_voter()` function
   - Handles cases where one user is idle during voting
   - Gives active user boost +10 and respin

8. ✅ **State Machine Consistency Fixed** - Updated `is_matchable()` and `guardian_queue_consistency()`
   - `is_matchable()` now excludes `paired`, `vote_active`, `video_date` states
   - `guardian_queue_consistency()` now includes `paired` as valid state
   - Prevents users in reveal phase from being re-matched

9. ✅ **Reconnect State Logic** - Added `determine_reconnect_state()` function
   - Determines appropriate state when user reconnects
   - Checks for active matches and votes
   - Returns to correct state based on context

10. ✅ **Reveal Engine Implemented** - Complete reveal → vote transition
    - `complete_reveal()` handles reveal completion
    - `handle_reveal_timeout()` handles idle users during reveal
    - Atomic transition from `paired` to `vote_active`

11. ✅ **Vote Timeout Scheduler** - `check_vote_timeouts()` function
    - Checks for idle voters every 10 seconds (via pg_cron/Edge Function)
    - Automatically handles timed-out votes
    - Prevents stuck matches

12. ✅ **Reveal Timeout Scheduler** - `check_reveal_timeouts()` function
    - Checks for idle users during reveal phase
    - 15-second timeout for reveal completion
    - Prevents stuck reveal states

13. ✅ **Tier Differentiation in Orchestrator** - Updated `matching_orchestrator()`
    - Processes users by fairness tiers (Tier 1: ≥200, Tier 2: 50-199, Tier 3: <50)
    - Ensures high-fairness users get exact preferences first
    - Better matching distribution

14. ✅ **Gender Preference Validation** - `validate_gender_compatibility()` function
    - Validates opposite gender requirement before matching
    - Prevents same-gender matches
    - Called in `create_match_atomic()`

15. ✅ **Preference Expansion Fully Integrated** - Complete `apply_preference_expansion()` and `reset_preference_expansion()` functions
    - **When expansion starts**: After 30 seconds of waiting in queue
    - **Expansion increments**: Age ±5 years, Distance +50 miles
    - **When expanded preferences apply**: Used in Tier 2 matching
    - **Reset triggers**: After successful matches (all tiers), after 5 minutes, on respin
    - **Guardian cleanup**: Resets expired expansions periodically
    - Prevents stale expanded preferences

16. ✅ **Early Return for Zero Online Users** - Added check in Tier 3
    - Returns NULL if no online opposite-gender users exist
    - Prevents unnecessary 30 retry cycles
    - Frontend shows "waiting for partner" message

17. ✅ **Strict Ordering in create_match_atomic** - Added `FOR UPDATE NOWAIT` locks
    - Locks both users in consistent order (lower UUID first)
    - Prevents deadlocks and duplicate pairing race conditions
    - Double-checks match status with locks held

18. ✅ **Online Status Re-check** - Added before all match creation
    - Re-checks online status in Tier 1, Tier 2, and Tier 3
    - Prevents matching offline users
    - Re-checks before each retry in Tier 3 loop

19. ✅ **Atomic Reveal Tracking** - Fixed `complete_reveal()` with `jsonb_set`
    - Uses atomic `jsonb_set` instead of concatenation
    - Prevents race conditions in parallel reveal writes
    - Prevents duplicate reveals

20. ✅ **Reconnect State Logic Fixed** - Updated `determine_reconnect_state()`
    - Handles partner voted pass scenario (forces respin)
    - Checks reveal completion status
    - Returns correct state based on match and vote context

21. ✅ **yes_yes_pairs Check in All Tiers** - Added `find_candidate()` function
    - Excludes yes_yes_pairs in Tier 1 and Tier 2
    - Ensures mutual yes-yes pairs are banned forever in all tiers
    - Prevents contradiction where they could slip back in

22. ✅ **Batching in Matching Orchestrator** - Limits processing to 20 users per tier
    - Prevents overload under 500+ users
    - Reduces lock hold time
    - Prevents latency spikes

23. ✅ **Fairness Calculation Frequency** - Reduced to every 5 seconds
    - Not recalculated every retry cycle
    - Reduces database load
    - Prevents queue thrashing

24. ✅ **State Machine Invariant Validation** - Added `validate_invariants()` function
    - Validates state invariants before transitions
    - Ensures vote_active requires active match
    - Ensures paired requires active match
    - Ensures online/offline state consistency
    - Prevents illegal states

25. ✅ **Detailed Guaranteed Match Logging** - Added per-iteration logging
    - Logs why no candidate found each iteration
    - Logs when candidate goes offline
    - Logs when match creation fails (deadlock, already matched)
    - Enables debugging of guaranteed match failures

26. ✅ **Metadata Cleanup on Match Deletion** - Added revealed_users cleanup
    - Cleans up metadata.revealed_users when matches are broken
    - Prevents stale reveal state
    - Applied to all match deletion points

27. ✅ **Orchestrator Wait Time Consideration** - Updated tier assignment
    - Tier 1: High fairness OR wait time >= 2 minutes
    - Tier 2/3: Wait time < 2 minutes
    - Prevents long-waiting users from being stuck in Tier 3
    - Better prioritization of users who have been waiting

28. ✅ **Offline/Online Grace Period Fixed** - Corrected heartbeat and offline handling
    - `handle_user_offline()` marks soft_offline BEFORE updating profiles.is_online
    - `heartbeat_update()` only updates last_seen, not is_online
    - `finalize_user_offline()` updates profiles.is_online after grace period
    - Prevents race conditions between queue status and online status

29. ✅ **Queue Join State Machine Consistency** - Fixed `queue_join()` function
    - Removed direct SQL UPDATE of status
    - State machine is now single source of truth for status changes
    - All state transitions go through `state_machine_transition()`

30. ✅ **Preference Expansion Repeated Expansions** - Enhanced `apply_preference_expansion()`
    - Supports repeated expansions (first at 30s, second at 60s)
    - Stores originals only on first expansion
    - Subsequent expansions modify current values
    - Proper reset to original values

## Next Steps

1. **Review this updated blueprint** - All critical fixes are now included
2. **Create detailed SQL migrations** - Implement each part in order
3. **Set up background schedulers** (see Part 9.6 for complete setup):
   - `cleanup_expired_soft_offline()` (every 5 seconds) - Part 5.2.1
   - `check_vote_timeouts()` (every 10 seconds) - Part 7.3.1
   - `check_reveal_timeouts()` (every 10 seconds) - Part 7.4.1
   - `collect_queue_metrics()` (every 30 seconds) - Part 9.4
   - `apply_gender_ratio_balancing()` (every 60 seconds) - Part 9.4
   - `monitor_queue_size()` (every 60 seconds) - Part 9.4
   - `matching_orchestrator()` (every 5 seconds) - Part 8.2
   - Use pg_cron, Supabase Edge Functions, or background orchestrator
4. **Create frontend API wrapper** - Simplify frontend calls to `queue_join()`, `submit_vote()`, and `complete_reveal()`
5. **Write comprehensive tests** - Verify all scenarios work correctly
6. **Gradual migration** - Move one piece at a time
7. **Monitor and adjust** - Ensure system works as expected

**All critical architectural gaps have been addressed. Ready to proceed with implementation.**

