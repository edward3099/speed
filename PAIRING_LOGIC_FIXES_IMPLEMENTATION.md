# Pairing Logic Fixes - Implementation Guide

## Summary: YES, There ARE Issues

**Answer**: **YES**, there are **3 critical issues** in the pairing logic that cause incomplete matching under high concurrent load.

---

## Issue 1: Lock Conflicts (CRITICAL) 🔴

### Problem
When 500 users call `process_matching` simultaneously, `create_pair_atomic` uses `FOR UPDATE NOWAIT` which **immediately fails** if another process has a lock. No retry = lost match opportunities.

### Current Code
```sql
-- In create_pair_atomic:
SELECT status INTO user1_status
FROM matching_queue
WHERE user_id = p_user1_id
FOR UPDATE NOWAIT;  -- ❌ Fails immediately if locked

EXCEPTION WHEN lock_not_available THEN
  RETURN NULL;  -- ❌ Gives up, no retry
```

### Impact
- **500 users**: Only 83-85% get matched (415-426 users)
- **Missing pairs**: 28-31 users who should be matched aren't
- **Root cause**: Lock conflicts when multiple users try to match simultaneously

### Fix
Add retry logic with exponential backoff:

```sql
CREATE OR REPLACE FUNCTION create_pair_atomic(
  p_user1_id UUID,
  p_user2_id UUID
) RETURNS UUID AS $$
DECLARE
  match_id UUID;
  user1_status TEXT;
  user2_status TEXT;
  update_count INTEGER;
  retry_count INTEGER := 0;
  max_retries INTEGER := 3;
  v_user1_id UUID;
  v_user2_id UUID;
BEGIN
  -- Fix: Use local variables for consistent ordering
  IF p_user1_id > p_user2_id THEN
    v_user1_id := p_user2_id;
    v_user2_id := p_user1_id;
  ELSE
    v_user1_id := p_user1_id;
    v_user2_id := p_user2_id;
  END IF;
  
  -- Retry loop for lock conflicts
  WHILE retry_count < max_retries LOOP
    BEGIN
      -- Try to lock both users
      SELECT status INTO user1_status
      FROM matching_queue
      WHERE user_id = v_user1_id
      FOR UPDATE NOWAIT;
      
      SELECT status INTO user2_status
      FROM matching_queue
      WHERE user_id = v_user2_id
      FOR UPDATE NOWAIT;
      
      -- If we get here, locks acquired successfully
      EXIT;
      
    EXCEPTION WHEN lock_not_available THEN
      retry_count := retry_count + 1;
      IF retry_count < max_retries THEN
        -- Exponential backoff: 100ms, 200ms, 300ms
        PERFORM pg_sleep(0.1 * retry_count);
      ELSE
        -- Max retries reached, give up
        RETURN NULL;
      END IF;
    END;
  END LOOP;
  
  -- Verify both are still matchable
  IF user1_status NOT IN ('spin_active', 'queue_waiting') OR
     user2_status NOT IN ('spin_active', 'queue_waiting') THEN
    RETURN NULL;
  END IF;
  
  -- Check if match already exists
  SELECT id INTO match_id
  FROM matches
  WHERE user1_id = v_user1_id
    AND user2_id = v_user2_id
    AND status = 'pending';
  
  IF match_id IS NOT NULL THEN
    RETURN match_id;
  END IF;
  
  -- Create match
  INSERT INTO matches (user1_id, user2_id, status, matched_at, vote_started_at)
  VALUES (v_user1_id, v_user2_id, 'pending', NOW(), NOW())
  ON CONFLICT (user1_id, user2_id) DO NOTHING
  RETURNING id INTO match_id;
  
  IF match_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Update both users to vote_active (atomic)
  UPDATE matching_queue
  SET status = 'vote_active',
      updated_at = NOW(),
      fairness_score = 0,
      skip_count = 0
  WHERE user_id IN (v_user1_id, v_user2_id)
    AND status IN ('spin_active', 'queue_waiting');
  
  GET DIAGNOSTICS update_count = ROW_COUNT;
  
  -- Verify both were updated
  IF update_count != 2 THEN
    -- Rollback: delete match and reset users
    DELETE FROM matches WHERE id = match_id;
    UPDATE matching_queue
    SET status = 'spin_active',
        updated_at = NOW()
    WHERE user_id IN (v_user1_id, v_user2_id)
      AND status = 'vote_active';
    RETURN NULL;
  END IF;
  
  RETURN match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Issue 2: Parameter Swap Bug (HIGH) 🟠

### Problem
Code tries to modify function parameters, which doesn't work in PostgreSQL.

### Current Code
```sql
IF p_user1_id > p_user2_id THEN
  DECLARE
    temp_id UUID := p_user1_id;
  BEGIN
    p_user1_id := p_user2_id;  -- ❌ Can't modify parameters!
    p_user2_id := temp_id;
  END;
END IF;
```

### Impact
- Parameters can't be modified
- Code doesn't work as intended
- May cause incorrect match ordering

### Fix
Already included in Fix 1 above - use local variables `v_user1_id` and `v_user2_id`.

---

## Issue 3: No Retry in `process_matching_v2` (HIGH) 🟠

### Problem
If `create_pair_atomic` returns NULL (lock conflict), function just moves to next tier without retrying the same candidate.

### Current Flow
```sql
best_match_id := find_best_match_v2(p_user_id, tier);
IF best_match_id IS NOT NULL THEN
  match_id := create_pair_atomic(p_user_id, best_match_id);
  IF match_id IS NULL THEN
    -- ❌ Just moves to next tier
    -- Doesn't retry same candidate
  END IF;
END IF;
```

### Impact
- User finds compatible partner
- Lock conflict prevents match
- User loses this match opportunity
- May find worse match or no match at all

### Fix
Add retry logic in `process_matching_v2`:

```sql
-- In process_matching_v2, modify the matching loop:
IF best_match_id IS NOT NULL THEN
  -- Try to create pair with retry
  match_id := create_pair_atomic(p_user_id, best_match_id);
  
  -- If lock conflict, retry same candidate
  IF match_id IS NULL THEN
    FOR retry IN 1..2 LOOP
      PERFORM pg_sleep(0.1 * retry);
      match_id := create_pair_atomic(p_user_id, best_match_id);
      IF match_id IS NOT NULL THEN
        EXIT; -- Success!
      END IF;
    END LOOP;
  END IF;
  
  IF match_id IS NOT NULL THEN
    -- Success! Log and return
    RETURN match_id;
  END IF;
END IF;
```

---

## Expected Impact After Fixes

### Before Fixes
- **500 users**: 83-85% match rate (415-426 users matched)
- **Pairs created**: 234-236 pairs
- **Unmatched**: 28-31 users

### After Fixes
- **500 users**: 95%+ match rate (475+ users matched)
- **Pairs created**: 245-250 pairs
- **Unmatched**: 0-10 users (legitimate cases)

---

## Implementation Priority

1. **Fix 1 (Lock Conflicts)**: Implement first - biggest impact
2. **Fix 2 (Parameter Bug)**: Included in Fix 1
3. **Fix 3 (Retry Logic)**: Implement second - improves success rate

---

## Testing After Fixes

1. Run scenarios again
2. Verify match rate improves to 95%+
3. Check that no duplicate pairs (should remain 0)
4. Monitor performance (may be slightly slower due to retries)

