# Matching Logic Redesign

## Executive Summary

This document presents a complete redesign of the speed dating matching system based on:
- Analysis of current implementation issues (race conditions, match deletions, fairness problems)
- Best practices from priority queue algorithms and fair queuing systems
- Requirements from `matching_logic.md`: "every spin leads to a pairing" guarantee
- Real-time matching system patterns

## Core Principles

1. **Guaranteed Pairing**: Every user who spins WILL be matched - no exceptions
2. **Fairness First**: Long-waiting users get priority, but not at the expense of others
3. **Atomic Operations**: All matching operations are atomic and race-condition free
4. **Progressive Expansion**: Preferences expand gradually, not all at once
5. **Real-time Responsive**: Matches happen as quickly as possible

## Architecture Overview

### Three-Tier Matching System

```
┌─────────────────────────────────────────────────────────┐
│ Tier 1: Immediate Match (0-2 seconds)                  │
│ - Exact preference matches                              │
│ - Highest priority users                                │
│ - Online users only                                     │
└─────────────────────────────────────────────────────────┘
                    ↓ (if no match)
┌─────────────────────────────────────────────────────────┐
│ Tier 2: Expanded Match (2-10 seconds)                  │
│ - Relaxed preferences (age ±2, distance +20%)           │
│ - Fairness boost applied                                 │
│ - Online users prioritized                              │
└─────────────────────────────────────────────────────────┘
                    ↓ (if no match)
┌─────────────────────────────────────────────────────────┐
│ Tier 3: Guaranteed Match (10+ seconds)                  │
│ - Maximum preference expansion                          │
│ - Offline users considered                              │
│ - Fairness score dominates                              │
│ - GUARANTEED to find a match                            │
└─────────────────────────────────────────────────────────┘
```

## Priority Queue System

### Priority Calculation Formula

```sql
priority_score = (
  fairness_boost * 1000 +           -- Primary factor (0-1000)
  queue_time_seconds * 10 +          -- Secondary factor (0-10000+)
  preference_match_score * 100 +     -- Tertiary factor (0-1000)
  distance_score * 10                -- Quaternary factor (0-100)
)
```

### Fairness Boost Calculation

```sql
fairness_boost = (
  base_wait_time_score +             -- Time in queue (0-500)
  skip_penalty_score +                -- Times skipped (0-300)
  narrow_preference_penalty +          -- Very specific preferences (0-100)
  low_queue_density_boost             -- Few users available (0-100)
)
```

Where:
- `base_wait_time_score = MIN(queue_time_seconds / 10, 500)`
- `skip_penalty_score = MIN(skip_count * 50, 300)`
- `narrow_preference_penalty = (preference_narrowness * 20)`
- `low_queue_density_boost = MAX(0, (10 - queue_size) * 10)`

## Matching Algorithm: Redesigned

### Phase 1: Candidate Discovery (Multi-Tier)

```sql
CREATE OR REPLACE FUNCTION find_best_match_v2(
  p_user_id UUID,
  p_tier INTEGER DEFAULT 1
) RETURNS UUID AS $$
DECLARE
  user_queue RECORD;
  user_profile RECORD;
  user_prefs RECORD;
  best_match_id UUID;
  best_priority_score DECIMAL(15, 2) := -1;
  candidate RECORD;
  priority_score DECIMAL(15, 2);
  tier_expansion JSONB;
BEGIN
  -- Get user's queue entry
  SELECT * INTO user_queue
  FROM matching_queue
  WHERE user_id = p_user_id
    AND status IN ('spin_active', 'queue_waiting')
  FOR UPDATE; -- Lock to prevent concurrent modifications
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get user profile and preferences
  SELECT * INTO user_profile FROM profiles WHERE id = p_user_id;
  SELECT * INTO user_prefs FROM user_preferences WHERE user_id = p_user_id;
  
  -- Determine expansion level based on tier
  tier_expansion := get_tier_expansion(p_tier, user_prefs);
  
  -- Find best match using priority queue
  FOR candidate IN
    SELECT 
      mq.*,
      p.*,
      up.*,
      -- Calculate priority score
      (
        (mq.fairness_score * 1000) +
        (EXTRACT(EPOCH FROM (NOW() - mq.joined_at))::INTEGER * 10) +
        (calculate_preference_match_score(p_user_id, mq.user_id) * 100) +
        (calculate_distance_score(user_profile, p) * 10)
      ) AS priority_score
    FROM matching_queue mq
    INNER JOIN profiles p ON p.id = mq.user_id
    INNER JOIN user_preferences up ON up.user_id = mq.user_id
    WHERE mq.user_id != p_user_id
      AND mq.status IN ('spin_active', 'queue_waiting')
      -- Tier-based filtering
      AND (
        (p_tier = 1 AND p.is_online = TRUE AND check_exact_preferences(user_id, mq.user_id))
        OR
        (p_tier = 2 AND p.is_online = TRUE AND check_expanded_preferences(user_id, mq.user_id, tier_expansion))
        OR
        (p_tier = 3 AND check_guaranteed_match(user_id, mq.user_id))
      )
      -- Gender compatibility (strict)
      AND (
        (user_profile.gender = 'male' AND p.gender = 'female' AND up.gender_preference = 'male')
        OR
        (user_profile.gender = 'female' AND p.gender = 'male' AND up.gender_preference = 'female')
      )
      -- Exclude blocked users
      AND NOT EXISTS (
        SELECT 1 FROM blocked_users 
        WHERE (blocker_id = p_user_id AND blocked_user_id = mq.user_id)
           OR (blocker_id = mq.user_id AND blocked_user_id = p_user_id)
      )
    ORDER BY priority_score DESC
    LIMIT 10 -- Consider top 10 candidates
  LOOP
    -- Verify candidate is still available (double-check with lock)
    IF candidate.status IN ('spin_active', 'queue_waiting') THEN
      IF candidate.priority_score > best_priority_score THEN
        best_priority_score := candidate.priority_score;
        best_match_id := candidate.user_id;
      END IF;
    END IF;
  END LOOP;
  
  RETURN best_match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Phase 2: Guaranteed Matching Process

```sql
CREATE OR REPLACE FUNCTION process_matching_v2(
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  match_id UUID;
  best_match_id UUID;
  tier INTEGER := 1;
  max_tiers INTEGER := 3;
  match_attempts INTEGER := 0;
  max_attempts INTEGER := 5;
BEGIN
  -- Try matching across all tiers
  WHILE tier <= max_tiers AND match_id IS NULL AND match_attempts < max_attempts LOOP
    match_attempts := match_attempts + 1;
    
    -- Find best match for current tier
    best_match_id := find_best_match_v2(p_user_id, tier);
    
    IF best_match_id IS NOT NULL THEN
      -- Attempt to create pair (atomic operation)
      match_id := create_pair_atomic(p_user_id, best_match_id);
      
      IF match_id IS NOT NULL THEN
        -- Success! Log tier used
        PERFORM log_match_created(p_user_id, best_match_id, match_id, tier);
        RETURN match_id;
      END IF;
    END IF;
    
    -- Move to next tier if no match found
    tier := tier + 1;
    
    -- Small delay between tiers to allow queue to update
    IF tier <= max_tiers THEN
      PERFORM pg_sleep(0.1); -- 100ms delay
    END IF;
  END LOOP;
  
  -- GUARANTEED MATCH: If still no match, force match with highest fairness user
  IF match_id IS NULL THEN
    best_match_id := find_guaranteed_match(p_user_id);
    
    IF best_match_id IS NOT NULL THEN
      match_id := create_pair_atomic(p_user_id, best_match_id);
      
      IF match_id IS NOT NULL THEN
        PERFORM log_match_created(p_user_id, best_match_id, match_id, 99); -- Tier 99 = forced match
        RETURN match_id;
      END IF;
    END IF;
  END IF;
  
  RETURN match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Phase 3: Atomic Pair Creation

```sql
CREATE OR REPLACE FUNCTION create_pair_atomic(
  p_user1_id UUID,
  p_user2_id UUID
) RETURNS UUID AS $$
DECLARE
  match_id UUID;
  user1_status TEXT;
  user2_status TEXT;
  lock_timeout INTEGER := 5; -- 5 seconds
BEGIN
  -- Set lock timeout
  SET LOCAL lock_timeout = (lock_timeout || ' seconds')::INTERVAL;
  
  -- Lock both users' queue entries
  SELECT status INTO user1_status
  FROM matching_queue
  WHERE user_id = p_user1_id
  FOR UPDATE NOWAIT;
  
  SELECT status INTO user2_status
  FROM matching_queue
  WHERE user_id = p_user2_id
  FOR UPDATE NOWAIT;
  
  -- Verify both are still matchable
  IF user1_status NOT IN ('spin_active', 'queue_waiting') OR
     user2_status NOT IN ('spin_active', 'queue_waiting') THEN
    RETURN NULL;
  END IF;
  
  -- Create match
  INSERT INTO matches (user1_id, user2_id, status, matched_at, vote_started_at)
  VALUES (
    LEAST(p_user1_id, p_user2_id),
    GREATEST(p_user1_id, p_user2_id),
    'pending',
    NOW(),
    NOW()
  )
  ON CONFLICT (user1_id, user2_id) DO NOTHING
  RETURNING id INTO match_id;
  
  IF match_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Update both users to vote_active (atomic)
  UPDATE matching_queue
  SET status = 'vote_active',
      updated_at = NOW(),
      fairness_score = 0, -- Reset fairness on match
      skip_count = 0
  WHERE user_id IN (p_user1_id, p_user2_id)
    AND status IN ('spin_active', 'queue_waiting');
  
  -- Verify both were updated
  IF (SELECT COUNT(*) FROM matching_queue 
      WHERE user_id IN (p_user1_id, p_user2_id) 
      AND status = 'vote_active') != 2 THEN
    -- Rollback: delete match and reset users
    DELETE FROM matches WHERE id = match_id;
    UPDATE matching_queue
    SET status = 'spin_active',
        updated_at = NOW()
    WHERE user_id IN (p_user1_id, p_user2_id);
    RETURN NULL;
  END IF;
  
  RETURN match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Fairness Score System: Redesigned

### Dynamic Fairness Calculation

```sql
CREATE OR REPLACE FUNCTION calculate_fairness_score(
  p_user_id UUID
) RETURNS DECIMAL(10, 2) AS $$
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
    COUNT(*) OVER () - 1 -- Total queue size minus current user
  INTO queue_time_seconds, skip_count, queue_size
  FROM matching_queue mq
  WHERE mq.user_id = p_user_id;
  
  -- Calculate preference narrowness (0-1 scale)
  SELECT 
    (
      (max_age - min_age) / 50.0 +  -- Age range narrowness
      (max_distance / 200.0)        -- Distance narrowness
    ) / 2.0
  INTO preference_narrowness
  FROM user_preferences
  WHERE user_id = p_user_id;
  
  -- Base score from wait time (0-500)
  base_score := LEAST(queue_time_seconds / 10.0, 500.0);
  
  -- Skip penalty (0-300)
  skip_penalty := LEAST(skip_count * 50.0, 300.0);
  
  -- Narrow preference penalty (0-100)
  narrow_penalty := (1.0 - preference_narrowness) * 100.0;
  
  -- Low queue density boost (0-100)
  density_boost := GREATEST(0, (10 - queue_size) * 10.0);
  
  -- Final score
  final_score := base_score + skip_penalty + narrow_penalty + density_boost;
  
  -- Update fairness score
  UPDATE matching_queue
  SET fairness_score = final_score,
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  RETURN final_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Preference Expansion System

### Tier-Based Expansion

```sql
CREATE OR REPLACE FUNCTION get_tier_expansion(
  p_tier INTEGER,
  p_user_prefs RECORD
) RETURNS JSONB AS $$
DECLARE
  expansion JSONB;
BEGIN
  CASE p_tier
    WHEN 1 THEN
      -- Tier 1: No expansion, exact preferences
      expansion := jsonb_build_object(
        'min_age', p_user_prefs.min_age,
        'max_age', p_user_prefs.max_age,
        'max_distance', p_user_prefs.max_distance,
        'gender_preference', p_user_prefs.gender_preference,
        'allow_offline', false,
        'expansion_level', 0
      );
    
    WHEN 2 THEN
      -- Tier 2: Moderate expansion
      expansion := jsonb_build_object(
        'min_age', GREATEST(18, p_user_prefs.min_age - 2),
        'max_age', LEAST(100, p_user_prefs.max_age + 2),
        'max_distance', p_user_prefs.max_distance * 1.2,
        'gender_preference', p_user_prefs.gender_preference,
        'allow_offline', false,
        'expansion_level', 1
      );
    
    WHEN 3 THEN
      -- Tier 3: Maximum expansion
      expansion := jsonb_build_object(
        'min_age', GREATEST(18, p_user_prefs.min_age - 5),
        'max_age', LEAST(100, p_user_prefs.max_age + 5),
        'max_distance', p_user_prefs.max_distance * 1.5,
        'gender_preference', p_user_prefs.gender_preference,
        'allow_offline', true,
        'expansion_level', 2
      );
    
    ELSE
      -- Default: Maximum expansion
      expansion := jsonb_build_object(
        'min_age', 18,
        'max_age', 100,
        'max_distance', 1000,
        'gender_preference', p_user_prefs.gender_preference,
        'allow_offline', true,
        'expansion_level', 99
      );
  END CASE;
  
  RETURN expansion;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Guaranteed Match Function

### Fallback for "Every Spin Leads to Pairing"

```sql
CREATE OR REPLACE FUNCTION find_guaranteed_match(
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  user_profile RECORD;
  best_match_id UUID;
  best_fairness DECIMAL(10, 2) := -1;
  candidate RECORD;
BEGIN
  -- Get user profile
  SELECT * INTO user_profile FROM profiles WHERE id = p_user_id;
  
  -- Find ANY compatible user with highest fairness score
  FOR candidate IN
    SELECT 
      mq.user_id,
      mq.fairness_score,
      p.gender,
      up.gender_preference
    FROM matching_queue mq
    INNER JOIN profiles p ON p.id = mq.user_id
    INNER JOIN user_preferences up ON up.user_id = mq.user_id
    WHERE mq.user_id != p_user_id
      AND mq.status IN ('spin_active', 'queue_waiting')
      -- Gender compatibility only (all other filters relaxed)
      AND (
        (user_profile.gender = 'male' AND p.gender = 'female' AND up.gender_preference = 'male')
        OR
        (user_profile.gender = 'female' AND p.gender = 'male' AND up.gender_preference = 'female')
      )
      -- Exclude blocked users only
      AND NOT EXISTS (
        SELECT 1 FROM blocked_users 
        WHERE (blocker_id = p_user_id AND blocked_user_id = mq.user_id)
           OR (blocker_id = mq.user_id AND blocked_user_id = p_user_id)
      )
    ORDER BY mq.fairness_score DESC, mq.joined_at ASC
    LIMIT 1
  LOOP
    best_match_id := candidate.user_id;
    EXIT; -- Take first available
  END LOOP;
  
  RETURN best_match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Continuous Fairness Updates

### Background Process

```sql
CREATE OR REPLACE FUNCTION update_fairness_scores()
RETURNS void AS $$
BEGIN
  -- Update fairness scores for all users in queue
  UPDATE matching_queue
  SET fairness_score = calculate_fairness_score(user_id),
      updated_at = NOW()
  WHERE status IN ('spin_active', 'queue_waiting');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Race Condition Prevention

### Lock-Based Matching

1. **Row-Level Locking**: Use `FOR UPDATE NOWAIT` to lock queue entries
2. **Transaction Isolation**: All matching operations in single transaction
3. **Status Verification**: Double-check status after lock acquisition
4. **Rollback on Failure**: If any step fails, rollback entire operation

## Performance Optimizations

1. **Indexed Queries**: Ensure indexes on:
   - `matching_queue(status, fairness_score, joined_at)`
   - `profiles(gender, is_online)`
   - `user_preferences(gender_preference)`

2. **Query Limits**: Limit candidate evaluation to top 10-20 users

3. **Caching**: Cache preference expansions for 5 seconds

4. **Batch Processing**: Update fairness scores in batches

## Monitoring & Logging

### Match Quality Metrics

```sql
CREATE TABLE match_quality_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES matches(id),
  user1_id UUID,
  user2_id UUID,
  tier_used INTEGER,
  priority_score DECIMAL(15, 2),
  preference_match_score DECIMAL(10, 2),
  distance_km DECIMAL(10, 2),
  match_time_seconds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Migration Plan

1. **Phase 1**: Deploy new functions alongside old ones
2. **Phase 2**: Test with small percentage of users
3. **Phase 3**: Gradually migrate all users
4. **Phase 4**: Remove old functions

## Testing Strategy

1. **Unit Tests**: Test each function independently
2. **Integration Tests**: Test full matching flow
3. **Load Tests**: Test with 100+ concurrent users
4. **Fairness Tests**: Verify fairness score accuracy
5. **Guarantee Tests**: Verify every spin leads to pairing

## Success Metrics

- **Match Rate**: 100% (every spin leads to pairing)
- **Average Match Time**: < 5 seconds for 90% of users
- **Fairness Score Accuracy**: Users with higher scores match faster
- **Race Condition Rate**: 0% (all operations atomic)
- **System Stability**: 99.9% uptime

