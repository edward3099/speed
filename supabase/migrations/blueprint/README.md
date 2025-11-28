# Matching Engine - Complete Rebuild

This directory contains the complete matching engine rebuilt from scratch according to the specification (Parts 1-10).

## Database Schema

### Tables (001-007)
- `001_users_table.sql` - Core user identity (gender, online, cooldown)
- `002_user_status_table.sql` - State machine tracking
- `003_queue_table.sql` - Waiting room for spin_active users
- `004_matches_table.sql` - Pairing table
- `005_votes_table.sql` - Vote storage
- `006_never_pair_again_table.sql` - Permanent blocklist
- `007_debug_logs_table.sql` - System observability

## Core Functions

### Matching Engine (101-103)
- `101_create_pair_atomic.sql` - Atomic pairing with FOR UPDATE SKIP LOCKED
- `102_find_best_match.sql` - Priority scoring and candidate selection
- `103_process_matching.sql` - Main matching engine

### Preference & Fairness (104-105)
- `104_preference_expansion.sql` - Expansion stages (10s/15s/20s)
- `105_fairness_engine.sql` - Fairness scoring (wait_time + yes_boost * 10)

### Voting & Outcomes (106)
- `106_vote_engine.sql` - Vote recording and outcome resolution
  - Both yes → video_date + never_pair_again
  - Yes + pass → yes voter +10 boost + auto respin, pass voter → idle
  - Yes + idle → idle removed, yes voter +10 + auto respin
  - Both pass → both idle + never_pair_again

### Cooldown & Blocklist (107-108)
- `107_cooldown_engine.sql` - 5-minute cooldown management
- `108_blocklist_engine.sql` - Never pair again management

### Queue Management (109)
- `109_queue_functions.sql` - Join/remove from queue

### State Machine (110)
- `110_state_machine.sql` - Legal state transitions enforcement

### Guardians (111)
- `111_guardians.sql` - Background checks (offline removal, stale matches, expansion)

### Disconnect Handling (112)
- `112_disconnect_handler.sql` - Disconnect behavior (cooldown, partner boost)

## API Routes

- `/api/spin/route.ts` - Join queue and trigger matching
- `/api/vote/route.ts` - Submit vote and resolve outcomes
- `/api/heartbeat/route.ts` - Update online status
- `/api/match/route.ts` - Poll for assigned match

## Key Features

✅ Atomic pairing with FOR UPDATE SKIP LOCKED
✅ Preference expansion: 0-10s (stage 0), 10-15s (stage 1), 15-20s (stage 2), 20s+ (stage 3)
✅ Fairness: wait_time + (yes_boost_events * 10)
✅ Voting outcomes match specification exactly
✅ Cooldown: 5 minutes on disconnect
✅ Never pair again: symmetric blocklist
✅ State machine: enforces legal transitions
✅ Guardians: auto-repair broken states
✅ Disconnect handling: protects yes voters

## Next Steps

1. Apply migrations to Supabase
2. Create TypeScript services (wrappers around RPC functions)
3. Update frontend to use new API routes
4. Test with scenarios from Part 8
5. Run validation from Part 9

## Migration Order

Apply migrations in numerical order (001, 002, 003, ...).
