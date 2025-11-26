# 📋 Remaining Tasks

## ✅ Completed

1. ✅ **44+ SQL Migrations Applied** - All database functions created
2. ✅ **4 TypeScript API Routes Created** - `/api/match/*` endpoints ready
3. ✅ **2 TypeScript Helper Files Created** - State machine and orchestrator helpers
4. ✅ **8 Background Schedulers Active** - All cron jobs running

---

## 🔄 Remaining Tasks

### 1. **Frontend Integration** (HIGH PRIORITY)

**Current Status:** Frontend still uses old RPC calls

**What Needs to Change:**

#### A. Replace `spark_join_queue` with `queue_join` API
- **Location:** `src/app/spin/page.tsx` (around line 1712)
- **Current:** Direct RPC call to `spark_join_queue`
- **New:** Call `/api/match/run` or use `queue_join()` RPC (new function)

#### B. Replace `process_matching` with matching orchestrator
- **Location:** `src/app/spin/page.tsx` (around line 1783)
- **Current:** Direct RPC call to `process_matching` (old function)
- **New:** Matching is now automatic via `matching_orchestrator()` scheduler (runs every 5s)
- **Action:** Remove manual matching calls - system handles it automatically

#### C. Replace vote submission with API route
- **Location:** `src/app/spin/page.tsx` (vote handling)
- **Current:** Direct RPC call (if any)
- **New:** Use `/api/match/vote` endpoint

#### D. Replace reveal completion with API route
- **Location:** `src/app/spin/page.tsx` (reveal handling)
- **Current:** Direct RPC call (if any)
- **New:** Use `/api/match/reveal` endpoint

#### E. Add reconnection handling
- **Location:** `src/app/spin/page.tsx` (heartbeat/reconnection)
- **New:** Use `/api/match/reconnect` endpoint for reconnection

**Files to Update:**
- `src/app/spin/page.tsx` - Main spin page

---

### 2. **Remove Old Functions** (MEDIUM PRIORITY)

**Old functions that should be removed/deprecated:**
- `spark_join_queue` (replaced by `queue_join`)
- `process_matching_v2` (replaced by `unified_matching_engine`)
- `create_pair` (replaced by `create_match_atomic`)
- Any other old matching functions

**Note:** These were already dropped in the cleanup, but verify they're gone.

---

### 3. **Testing** (OPTIONAL BUT RECOMMENDED)

**Create test suite for:**
- API route endpoints (`/api/match/*`)
- State machine transitions
- Matching scenarios
- Vote scenarios
- Reveal scenarios
- Offline/reconnection scenarios
- Timeout scenarios

**Location:** Create in `tests/matching-v3/` (standalone folder)

---

### 4. **Documentation** (OPTIONAL)

- Update frontend documentation
- Create migration guide for frontend developers
- Document API route usage

---

## 🎯 Priority Order

1. **HIGH:** Frontend Integration (Update spin page to use new system)
2. **MEDIUM:** Verify old functions are removed
3. **LOW:** Testing suite
4. **LOW:** Additional documentation

---

## 📝 Quick Reference

### New API Routes Available:
- `POST /api/match/run` - Run matching orchestrator (usually automatic)
- `POST /api/match/vote` - Submit vote (`{ match_id, vote_type: 'yes' | 'pass' }`)
- `POST /api/match/reconnect` - Handle reconnection
- `POST /api/match/reveal` - Complete reveal (`{ match_id }`)

### New RPC Functions Available:
- `queue_join(p_user_id, p_preferences)` - Join queue
- `queue_remove(p_user_id, p_reason)` - Remove from queue
- `submit_vote(p_user_id, p_match_id, p_vote_type)` - Submit vote
- `complete_reveal(p_user_id, p_match_id)` - Complete reveal
- `heartbeat_update(p_user_id)` - Update heartbeat
- `state_machine_transition(p_user_id, p_event_type, p_event_data)` - State transition

### Key Changes:
- **Matching is now automatic** - `matching_orchestrator()` runs every 5 seconds
- **No manual matching calls needed** - System handles matching automatically
- **Use API routes** - Prefer API routes over direct RPC calls for better error handling
- **State machine is single source of truth** - All state changes go through `state_machine_transition()`

---

## 🚀 Next Immediate Step

**Update `src/app/spin/page.tsx`:**

1. Replace `spark_join_queue` → `queue_join` (or use API route)
2. Remove `process_matching` calls (matching is now automatic)
3. Replace vote submission → `/api/match/vote`
4. Replace reveal completion → `/api/match/reveal`
5. Add reconnection handling → `/api/match/reconnect`

The matching system backend is **100% complete**. Only frontend integration remains!

