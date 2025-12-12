# Old Backend Logic Cleanup

## ✅ Cleaned Up

### API Endpoints
- ✅ `/api/cron/matching` - Deprecated (matching is now event-driven)
- ✅ `/api/match/process` - Deprecated (matching is now event-driven)
- ✅ `/api/cron/refresh-pool` - Deprecated (matching_pool removed)
- ✅ `/api/test/vote` - Updated to use `record_vote` instead of `record_vote_and_resolve`
- ✅ `/api/health` - Updated to check `try_match_user` instead of `process_matching`

### Scheduler
- ✅ `src/lib/cron/matching-scheduler.ts` - Disabled (matching is now event-driven)

### Frontend
- ✅ `/spin` page - Updated state types to remove `paired` and `vote_window`
- ✅ Vote window UI hidden (redirects to `/voting-window` instead)

## ⚠️ Still Exists (But Not Used)

### Database Objects
- `queue` table - Still exists but not used (can be dropped later)
- `process_matching()` function - Still exists but not called
- `record_vote_and_resolve()` function - Still exists but not called
- `refresh_matching_pool()` function - Still exists but not called
- `matching_pool` materialized view - Already dropped in migration

### Old Migrations
- Old migration files still reference old logic (historical record, safe to leave)

## Notes

The old backend logic has been disabled/removed from active use. The old database functions and tables still exist but are not called by the new architecture. They can be dropped in a future cleanup migration if desired, but leaving them doesn't cause issues since they're not referenced.







