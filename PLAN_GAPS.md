# Critical Gaps Found in BACKEND_INTEGRATION_PLAN.md

## 🚨 CRITICAL: Missing RLS Policy for Profile Discovery

### Problem
The `profiles` table RLS policies (lines 203-216) only allow users to read **their own profile**:
```sql
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);
```

**This breaks the entire matching system!** Users need to read **other users' profiles** for matching/discovery, but the current RLS policy blocks this.

### Solution Needed
Add a new RLS policy that allows authenticated users to read other users' profiles for matching purposes:
```sql
-- Policy: Users can read other profiles for matching (but not all fields)
CREATE POLICY "Users can read profiles for matching"
  ON profiles FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND
    -- Exclude blocked users
    id NOT IN (
      SELECT blocked_user_id 
      FROM blocked_users 
      WHERE blocker_id = auth.uid()
    )
  );
```

**OR** if we want to be more restrictive, only allow reading profiles that match certain criteria (age range, distance, etc.) - but this is complex and may need to be done at the application level.

**Recommendation:** Allow reading all profiles (except blocked ones) for authenticated users, as the matching query already filters by preferences.

---

## ⚠️ Missing: Gender Preference Field

### Problem
The plan mentions "gender preference filtering" (lines 970, 1058) but:
1. The `user_preferences` table (lines 221-228) doesn't have a `gender_preference` field
2. The onboarding flow doesn't mention collecting gender preference

### Solution Needed
1. Add `gender_preference` field to `user_preferences` table:
```sql
ALTER TABLE user_preferences 
ADD COLUMN gender_preference TEXT CHECK (gender_preference IN ('male', 'female', 'all', 'non-binary'));
```

2. Add gender preference selection to onboarding step 6 (preferences step)

---

## ⚠️ Missing: User Gender Collection

### Problem
The `profiles` table has a `gender` field (line 192), but:
- The onboarding flow doesn't mention collecting user's own gender
- No step in onboarding asks "what's your gender?"

### Solution Needed
Add a gender selection step to onboarding (could be step 2, after name, before age):
- Options: Male, Female, Non-binary, Prefer not to say
- Store in `profiles.gender` field

---

## ⚠️ Missing: Incomplete Onboarding Flow

### Problem
The plan mentions (line 48):
> "Should sign-in users skip onboarding if they already have a profile?"

But doesn't specify:
- How to check if user has completed onboarding
- What happens if user signs in but profile is incomplete
- Should there be a `onboarding_completed` boolean field?

### Solution Needed
1. Add `onboarding_completed` boolean to `profiles` table (or check if profile exists)
2. On sign-in, check if profile exists and is complete
3. If incomplete, redirect to onboarding
4. If complete, redirect to `/spin`

---

## ⚠️ Missing: RLS Policy for Reading Other Users' Preferences

### Problem
For matching, we might need to read other users' preferences to check if we match their criteria. But current RLS (lines 234-236) only allows reading own preferences.

### Solution Needed
**Question:** Do we need to read other users' preferences for matching?
- If yes, add RLS policy to allow reading preferences for matching purposes
- If no (we only check current user's preferences against other users' profiles), then current RLS is fine

**Recommendation:** We probably don't need to read other users' preferences - we only need to check if other users match OUR preferences. So this might be fine as-is.

---

## ⚠️ Missing: Votes Table RLS - Can We Check If Someone Voted On Us?

### Problem
The votes table RLS (lines 764-766) only allows users to see their own votes. But for matching logic, we might need to check:
- "Did this user already vote on me?"
- "Did I already vote on this user?"

### Solution Needed
**Current RLS:**
```sql
CREATE POLICY "Users can manage own votes"
  ON votes FOR ALL
  USING (auth.uid() = voter_id);
```

**This is probably fine** - we can check if we voted on someone by querying our own votes. But we can't check if someone voted on us (which we might need for "exclude users who passed on current user").

**Solution:** Add a policy to allow reading votes where we are the `profile_id`:
```sql
CREATE POLICY "Users can see votes on their profile"
  ON votes FOR SELECT
  USING (auth.uid() = profile_id);
```

---

## ⚠️ Missing: Profile Discovery Query RLS Compatibility

### Problem
The profile discovery query (lines 1185-1227) tries to read other users' profiles, but with current RLS, this would fail.

### Solution Needed
This is related to the first critical issue - we need the RLS policy that allows reading other profiles for matching.

---

## ⚠️ Missing: Indexes for Performance

### Problem
The plan has many complex queries (profile discovery, matching, etc.) but doesn't mention database indexes for performance.

### Solution Needed
Add indexes for:
- `profiles(latitude, longitude)` - for distance queries
- `profiles(is_online, last_active_at)` - for activity queries
- `votes(voter_id, profile_id)` - for vote lookups
- `profile_views(viewer_id, viewed_at)` - for 24-hour exclusion
- `matches(user1_id, user2_id)` - for match lookups
- `blocked_users(blocker_id, blocked_user_id)` - for block checks

---

## ⚠️ Missing: Gender Field Validation

### Problem
The `profiles.gender` field (line 192) is just `TEXT` with no constraints. Should have CHECK constraint.

### Solution Needed
```sql
ALTER TABLE profiles 
ADD CONSTRAINT check_gender 
CHECK (gender IN ('male', 'female', 'non-binary', 'prefer_not_to_say') OR gender IS NULL);
```

---

## Summary of Critical Issues

1. **🚨 CRITICAL:** Missing RLS policy to read other users' profiles (breaks matching)
2. **⚠️ HIGH:** Missing gender preference field in user_preferences
3. **⚠️ HIGH:** Missing gender collection in onboarding
4. **⚠️ MEDIUM:** Missing onboarding completion check flow
5. **⚠️ MEDIUM:** Missing RLS policy to check votes on our profile
6. **⚠️ LOW:** Missing database indexes for performance
7. **⚠️ LOW:** Missing gender field validation

---

## Recommended Priority Fixes

1. **Fix RLS policy for profile discovery** (CRITICAL - blocks everything)
2. **Add gender and gender_preference fields** (HIGH - needed for matching)
3. **Add onboarding completion check** (MEDIUM - needed for user flow)
4. **Add indexes** (LOW - performance optimization, can be done later)

