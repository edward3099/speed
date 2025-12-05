# Post-Matching Flow Suggestions - Fixing Voting Window & Video-Date Issues

## Problem Statement

Persistent issues in the post-matching flow:
- **Users match but never reach voting window** - Acknowledgment flow failing
- **Voting window has timer issues** - Timer not syncing, expiring incorrectly
- **Voting has issues** - Votes not recorded, outcomes not resolved
- **Both yes votes don't go to video-date** - Outcome resolution failing

These issues suggest problems in the state transition chain:
**Match → Acknowledge → Voting Window → Vote → Outcome → Video-Date**

---

## Root Cause Analysis

### Issue 1: Users Match But Never Reach Voting Window

**Possible Causes:**
1. Acknowledgment not happening (both users must acknowledge)
2. Acknowledgment timeout too short (500ms window too tight)
3. Countdown not starting after acknowledgment
4. State transition failing silently
5. Frontend not calling acknowledge API
6. Race condition (one user acknowledges, other doesn't)

**Current Flow:**
- User A matches → User B matches
- Both must acknowledge within 500ms
- If both acknowledge → start countdown → voting window
- If timeout → match cancelled

**Problem:** 500ms is too short for real-world network conditions. If one user's device is slow or network is delayed, they miss the window.

---

### Issue 2: Voting Window Timer Issues

**Possible Causes:**
1. Timer not starting when voting window opens
2. Timer expires before users can vote
3. Timer not synced between frontend and backend
4. Timer state not persisted (refresh loses timer)
5. Timer calculation wrong (wrong expiration time)
6. Frontend calculates timer from local time, backend uses server time

**Current Flow:**
- Voting window starts → `vote_window_expires_at` set in database
- Frontend calculates remaining time
- Backend validates votes against expiration

**Problem:** Frontend and backend might have different times, or timer calculation is wrong.

---

### Issue 3: Voting Issues

**Possible Causes:**
1. Vote not being recorded (API fails)
2. Vote recorded but outcome not resolved
3. Vote window expired before vote recorded
4. User not in `vote_window` state when voting
5. Race condition (both vote simultaneously)
6. Vote validation failing

**Current Flow:**
- User votes → Record vote → Check if both voted → Resolve outcome

**Problem:** Vote recording and outcome resolution are separate steps. If outcome resolution fails, vote is recorded but nothing happens.

---

### Issue 4: Both Yes Votes Don't Go to Video-Date

**Possible Causes:**
1. Outcome not being resolved when both vote yes
2. Video-date record not being created
3. State not transitioning to video-date
4. Redirect not happening
5. Video-date creation failing silently
6. Transaction rollback (partial failure)

**Current Flow:**
- Both vote yes → Resolve outcome to 'both_yes' → Create video_date record → Transition to idle

**Problem:** These are separate operations. If video-date creation fails, outcome is resolved but users are stuck.

---

## 10 Ideas to Fix Post-Matching Flow

### 1. Make Acknowledgment More Forgiving ⭐ CRITICAL

**Problem:** 500ms timeout is too short for real-world conditions

**Solution:**
- Increase timeout to 2-3 seconds (more realistic)
- Allow acknowledgment from `vote_window` state (if already started)
- Start countdown when first user acknowledges (don't wait for both)
- Make acknowledgment idempotent (safe to retry)

**Why:** Handles network delays, slow devices, and retries gracefully

**Implementation:**
```sql
-- Increase acknowledgment window
-- Instead of 500ms, use 2-3 seconds
-- Or start countdown when first user acknowledges
-- Don't require both users to acknowledge before starting
```

**Priority:** 🔴 P0 - Must have

---

### 2. Store All Timing in Database ⭐ CRITICAL

**Problem:** Frontend and backend calculate timers differently

**Solution:**
- Store `vote_window_started_at` and `vote_window_expires_at` in matches table
- Frontend reads these and calculates remaining time
- Backend validates votes against same timestamps
- Never calculate timers in frontend - always read from database

**Why:** Ensures synchronization between frontend and backend

**Implementation:**
```sql
-- Matches table already has these columns
-- vote_window_started_at TIMESTAMPTZ
-- vote_window_expires_at TIMESTAMPTZ

-- Frontend calculates: expires_at - now()
-- Backend validates: vote_time < expires_at
-- Both use same timestamps from database
```

**Priority:** 🔴 P0 - Must have

---

### 3. Make Vote Recording Atomic with Outcome Resolution ⭐ CRITICAL

**Problem:** Vote recorded but outcome not resolved

**Solution:**
- When vote is recorded, immediately check if both have voted
- If both voted, resolve outcome in the same transaction
- Don't have separate "record vote" and "resolve outcome" steps
- Combine them into one atomic operation

**Why:** Prevents votes being recorded but outcomes not resolved

**Implementation:**
```sql
CREATE OR REPLACE FUNCTION record_vote_and_resolve(
  p_user_id UUID,
  p_match_id UUID,
  p_vote TEXT
) RETURNS JSONB AS $$
DECLARE
  v_both_voted BOOLEAN;
  v_outcome TEXT;
BEGIN
  -- Record vote
  INSERT INTO votes (match_id, voter_id, vote)
  VALUES (p_match_id, p_user_id, p_vote)
  ON CONFLICT (match_id, voter_id) DO UPDATE
  SET vote = EXCLUDED.vote;
  
  -- Check if both voted (in same transaction)
  SELECT COUNT(*) = 2 INTO v_both_voted
  FROM votes
  WHERE match_id = p_match_id;
  
  -- If both voted, resolve immediately
  IF v_both_voted THEN
    v_outcome := resolve_match_outcome(p_match_id);
    RETURN jsonb_build_object('outcome', v_outcome, 'resolved', true);
  END IF;
  
  -- If pass vote, resolve immediately (pass always wins)
  IF p_vote = 'pass' THEN
    v_outcome := resolve_match_outcome(p_match_id);
    RETURN jsonb_build_object('outcome', v_outcome, 'resolved', true);
  END IF;
  
  RETURN jsonb_build_object('waiting_for_partner', true);
END;
$$ LANGUAGE plpgsql;
```

**Priority:** 🔴 P0 - Must have

---

### 4. Create Video-Date Atomically with Outcome Resolution ⭐ CRITICAL

**Problem:** Outcome resolved but video-date not created

**Solution:**
- When outcome is 'both_yes', create video_date record in the same transaction
- Don't have separate steps
- Use database transaction to ensure both happen or neither happens

**Why:** Prevents outcome resolved but video-date not created

**Implementation:**
```sql
-- In resolve_match_outcome function
IF v_outcome = 'both_yes' THEN
  -- Create video_date in same transaction
  INSERT INTO video_dates (match_id, user1_id, user2_id, status)
  VALUES (p_match_id::TEXT, v_match.user1_id, v_match.user2_id, 'countdown')
  ON CONFLICT DO NOTHING;
  
  -- Add to match_history
  INSERT INTO match_history (user1_id, user2_id, match_id, outcome)
  VALUES (v_match.user1_id, v_match.user2_id, p_match_id, 'both_yes')
  ON CONFLICT DO NOTHING;
  
  -- Transition both users to idle
  UPDATE users_state
  SET state = 'idle', partner_id = NULL, match_id = NULL
  WHERE user_id IN (v_match.user1_id, v_match.user2_id);
END IF;
```

**Priority:** 🔴 P0 - Must have

---

### 5. Add State Transition Validation at Every Step

**Problem:** Invalid state transitions cause silent failures

**Solution:**
- Before transitioning to vote_window, validate both users are in 'paired' state
- Before recording vote, validate user is in 'vote_window' state and timer hasn't expired
- Before creating video-date, validate outcome is 'both_yes'
- Fail fast with clear errors

**Why:** Prevents invalid transitions and makes debugging easier

**Implementation:**
```typescript
// Before starting vote window
if (user1State.state !== 'paired' || user2State.state !== 'paired') {
  throw new Error('Both users must be in paired state');
}

// Before recording vote
if (userState.state !== 'vote_window') {
  throw new Error('User must be in vote_window state');
}

if (match.vote_window_expires_at < new Date()) {
  throw new Error('Vote window has expired');
}

// Before creating video-date
if (match.outcome !== 'both_yes') {
  throw new Error('Outcome must be both_yes to create video-date');
}
```

**Priority:** 🟡 P1 - Should have

---

### 6. Implement State Repair for Stuck Users

**Problem:** Users get stuck in intermediate states

**Solution:**
- Background job that detects:
  - Users in 'paired' state but no vote_window started after 5 seconds
  - Users in 'vote_window' but timer expired
  - Users with 'both_yes' outcome but no video-date
- Auto-repair these states

**Why:** System heals itself from partial failures

**Implementation:**
```sql
CREATE OR REPLACE FUNCTION repair_stuck_states() RETURNS INTEGER AS $$
DECLARE
  repaired INTEGER := 0;
BEGIN
  -- Users in paired but vote_window never started (after 5s)
  UPDATE users_state
  SET state = 'idle', partner_id = NULL, match_id = NULL
  WHERE state = 'paired'
    AND match_id IN (
      SELECT match_id FROM matches
      WHERE status = 'pending'
        AND created_at < NOW() - INTERVAL '5 seconds'
        AND vote_window_started_at IS NULL
    );
  
  GET DIAGNOSTICS repaired = ROW_COUNT;
  
  -- Users in vote_window but timer expired
  UPDATE users_state
  SET state = 'idle', partner_id = NULL, match_id = NULL
  WHERE state = 'vote_window'
    AND match_id IN (
      SELECT match_id FROM matches
      WHERE vote_window_expires_at < NOW()
        AND status = 'vote_active'
    );
  
  -- Users with both_yes but no video-date
  -- Create video-date for these
  INSERT INTO video_dates (match_id, user1_id, user2_id, status)
  SELECT m.match_id::TEXT, m.user1_id, m.user2_id, 'countdown'
  FROM matches m
  WHERE m.outcome = 'both_yes'
    AND NOT EXISTS (
      SELECT 1 FROM video_dates WHERE match_id = m.match_id::TEXT
    );
  
  RETURN repaired;
END;
$$ LANGUAGE plpgsql;
```

**Priority:** 🟡 P1 - Should have

---

### 7. Comprehensive Flow Logging

**Problem:** Don't know where the flow breaks

**Solution:**
- Log every step: match created, acknowledgment received, vote_window started, vote recorded, outcome resolved, video-date created
- This helps debug where the flow breaks

**Why:** If users match but never vote, logs show if acknowledgment happened or not

**Implementation:**
```sql
CREATE TABLE flow_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES matches(match_id),
  user_id UUID REFERENCES profiles(id),
  step TEXT NOT NULL, -- 'match_created', 'acknowledged', 'vote_window_started', 'vote_recorded', 'outcome_resolved', 'video_date_created'
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

-- Log at every step
INSERT INTO flow_log (match_id, user_id, step, metadata)
VALUES (match_id, user_id, 'acknowledged', jsonb_build_object('partner_acknowledged', partner_acked));
```

**Priority:** 🟡 P1 - Should have

---

### 8. Make Flow Idempotent

**Problem:** Retries cause errors

**Solution:**
- If user tries to acknowledge twice, that's fine (idempotent)
- If user tries to vote twice, update the vote (idempotent)
- If outcome already resolved, don't resolve again (idempotent)

**Why:** Handles retries, network issues, and duplicate requests gracefully

**Implementation:**
```sql
-- Acknowledgment is idempotent
-- If already acknowledged, just return success

-- Vote is idempotent (upsert)
INSERT INTO votes (match_id, voter_id, vote)
VALUES (p_match_id, p_user_id, p_vote)
ON CONFLICT (match_id, voter_id) DO UPDATE
SET vote = EXCLUDED.vote;

-- Outcome resolution is idempotent
-- If already resolved, just return existing outcome
```

**Priority:** 🟡 P1 - Should have

---

### 9. Use Database Triggers for Automatic Transitions

**Problem:** Application logic might fail

**Solution:**
- When both users acknowledge, trigger automatically starts vote_window
- When both vote yes, trigger automatically creates video-date
- This ensures transitions happen even if application logic fails

**Why:** Database enforces the flow

**Implementation:**
```sql
-- Trigger: When both users acknowledge, start vote_window
CREATE OR REPLACE FUNCTION auto_start_vote_window() RETURNS TRIGGER AS $$
BEGIN
  -- Check if both users have acknowledged
  IF (SELECT COUNT(*) FROM users_state
      WHERE match_id = NEW.match_id
        AND acknowledged_at IS NOT NULL) = 2 THEN
    -- Start vote window
    UPDATE matches
    SET 
      status = 'vote_active',
      vote_window_started_at = NOW(),
      vote_window_expires_at = NOW() + INTERVAL '10 seconds'
    WHERE match_id = NEW.match_id;
    
    -- Update both users to vote_window state
    UPDATE users_state
    SET state = 'vote_window'
    WHERE match_id = NEW.match_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_start_vote_window
AFTER UPDATE OF acknowledged_at ON users_state
FOR EACH ROW
WHEN (NEW.acknowledged_at IS NOT NULL)
EXECUTE FUNCTION auto_start_vote_window();
```

**Priority:** 🟢 P2 - Nice to have

---

### 10. Implement Flow Monitoring

**Problem:** Don't know where bottlenecks are

**Solution:**
- Track the entire journey from match to video-date
- Monitor: time from match to acknowledgment, time from acknowledgment to vote_window, time from vote_window to vote, time from vote to video-date
- If any step takes too long or fails, alert

**Why:** Shows where bottlenecks are

**Implementation:**
```sql
CREATE TABLE flow_metrics (
  match_id UUID PRIMARY KEY REFERENCES matches(match_id),
  match_created_at TIMESTAMPTZ,
  first_ack_at TIMESTAMPTZ,
  second_ack_at TIMESTAMPTZ,
  vote_window_started_at TIMESTAMPTZ,
  first_vote_at TIMESTAMPTZ,
  second_vote_at TIMESTAMPTZ,
  outcome_resolved_at TIMESTAMPTZ,
  video_date_created_at TIMESTAMPTZ,
  
  -- Calculated metrics
  ack_time_seconds INTEGER,
  vote_window_delay_seconds INTEGER,
  vote_time_seconds INTEGER,
  resolution_time_seconds INTEGER
);

-- Calculate metrics
UPDATE flow_metrics
SET 
  ack_time_seconds = EXTRACT(EPOCH FROM (second_ack_at - match_created_at))::INTEGER,
  vote_window_delay_seconds = EXTRACT(EPOCH FROM (vote_window_started_at - second_ack_at))::INTEGER,
  vote_time_seconds = EXTRACT(EPOCH FROM (second_vote_at - vote_window_started_at))::INTEGER,
  resolution_time_seconds = EXTRACT(EPOCH FROM (outcome_resolved_at - second_vote_at))::INTEGER;
```

**Priority:** 🟡 P1 - Should have

---

## Priority Tiers

### 🔴 Tier 1: Must Have (Implement First)

1. **Make Acknowledgment More Forgiving** - Increase timeout, allow retries
2. **Store All Timing in Database** - Frontend reads from database
3. **Make Vote Recording Atomic with Outcome Resolution** - Same transaction
4. **Create Video-Date Atomically with Outcome Resolution** - Same transaction

### 🟡 Tier 2: Should Have (Implement Second)

5. **Add State Transition Validation** - Fail fast with clear errors
6. **Implement State Repair for Stuck Users** - Auto-heal system
7. **Comprehensive Flow Logging** - Know where flow breaks
8. **Make Flow Idempotent** - Handle retries gracefully
9. **Implement Flow Monitoring** - Track journey metrics

### 🟢 Tier 3: Nice to Have (Implement Third)

10. **Use Database Triggers for Automatic Transitions** - Database enforces flow

---

## The Core Insight

### The Flow is Fragile

Each step depends on the previous, and if any step fails, the whole flow breaks.

**Current Flow (Fragile):**
```
Match → Acknowledge → Vote Window → Vote → Outcome → Video-Date
  ↓         ↓            ↓          ↓       ↓          ↓
 Each step can fail independently
```

**Solution: Make Each Step:**
1. **More Forgiving** - Longer timeouts, allow retries
2. **Atomic** - Combine related operations
3. **Self-Healing** - Auto-repair stuck states
4. **Observable** - Comprehensive logging
5. **Idempotent** - Safe to retry

---

## Implementation Checklist

When building the post-matching flow:

- [ ] Acknowledgment timeout increased to 2-3 seconds
- [ ] Acknowledgment allowed from vote_window state
- [ ] All timing stored in database (vote_window_expires_at)
- [ ] Frontend reads timestamps from database
- [ ] Vote recording and outcome resolution in same transaction
- [ ] Video-date creation in same transaction as outcome resolution
- [ ] State transition validation at every step
- [ ] State repair for stuck users (background job)
- [ ] Comprehensive flow logging
- [ ] All operations idempotent
- [ ] Flow monitoring (track journey metrics)

---

## Common Pitfalls to Avoid

1. **Don't calculate timers in frontend** - Always read from database
2. **Don't separate vote recording from outcome resolution** - Do in same transaction
3. **Don't separate outcome resolution from video-date creation** - Do in same transaction
4. **Don't use short timeouts** - Real-world networks need more time
5. **Don't require both users to acknowledge before starting** - Start when first acknowledges
6. **Don't ignore stuck states** - Auto-repair them
7. **Don't make operations non-idempotent** - Safe to retry
8. **Don't skip validation** - Validate every transition

---

## Success Criteria

The post-matching flow is working correctly when:

- ✅ Users reach voting window within 2-3 seconds of matching
- ✅ Voting window timer is accurate and synced
- ✅ Votes are recorded and outcomes resolved immediately
- ✅ Both yes votes create video-date and redirect correctly
- ✅ No users stuck in intermediate states
- ✅ All state transitions are logged
- ✅ Flow metrics show reasonable timing (<5s total)

---

## Flow Diagram (Ideal)

```
User A matches User B
    ↓
Both in 'paired' state
    ↓
User A acknowledges (within 2-3s)
    ↓
User B acknowledges (within 2-3s)
    ↓
Vote window starts automatically
    ↓
vote_window_expires_at set in database
    ↓
Frontend reads expiration time
    ↓
User A votes → Recorded + Outcome checked (atomic)
    ↓
User B votes → Recorded + Outcome resolved (atomic)
    ↓
If both yes → Video-date created (same transaction)
    ↓
Both users redirected to video-date page
```

**Key:** Every step is atomic, logged, and self-healing.

---

*Document created: 2025-01-09*
*Purpose: Guide for building post-matching flow that prevents common failures*
*Based on: Sequential Thinking Analysis (20 thoughts)*

