# Gap Analysis: Backend Integration Status

## ✅ What's Complete

### 1. Credentials & Configuration
- ✅ **Supabase credentials** - URL and Anon Key in `.env.local`
- ✅ **LiveKit credentials** - URL, API Key, and Secret in `.env.local`
- ✅ **Algolia Places credentials** - App ID and API Key in `.env.local`
- ✅ **Environment variables** - All credentials properly configured

### 2. Location Autocomplete
- ✅ **Algolia Places component** - Created `LocationAutocomplete` component
- ✅ **Integrated in onboarding** - Step 5 now uses autocomplete
- ✅ **Coordinates captured** - `latitude` and `longitude` added to `onboardingData` state
- ✅ **Validation** - Prevents continuing without valid location selection
- ✅ **Package installed** - `algoliasearch` installed

---

## ❌ What's Missing (Critical)

### 1. Supabase Client Setup ⚠️ **CRITICAL**
**Status:** Not implemented
**Impact:** Cannot connect to backend at all

**Missing:**
- ❌ `@supabase/supabase-js` package not installed
- ❌ No Supabase client configuration file (`lib/supabase.ts` or similar)
- ❌ No Supabase client initialization
- ❌ No way to make API calls to Supabase

**Required:**
```bash
npm install @supabase/supabase-js
```

**Create:** `src/lib/supabase.ts`
```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

---

### 2. Database Schema ⚠️ **CRITICAL**
**Status:** Not created
**Impact:** No tables exist, cannot store any data

**Missing Tables:**
- ❌ `profiles` table (with latitude, longitude, gender, is_online, etc.)
- ❌ `user_preferences` table
- ❌ `votes` table
- ❌ `matches` table
- ❌ `profile_views` table
- ❌ `video_dates` table
- ❌ `date_ratings` table
- ❌ `contact_details` table
- ❌ `contact_exchanges` table
- ❌ `reports` table
- ❌ `blocked_users` table

**Missing Extensions:**
- ❌ `pgcrypto` extension (for contact encryption)

**Missing Functions:**
- ❌ `calculate_distance()` Haversine function

**Missing Storage:**
- ❌ `profile-pictures` bucket
- ❌ Bucket policies (public read, authenticated write)

**Action Required:**
- Run all SQL migrations in Supabase SQL Editor
- Create storage bucket manually in Supabase dashboard

---

### 3. Authentication System ⚠️ **CRITICAL**
**Status:** Not implemented
**Impact:** Users cannot sign up, sign in, or maintain sessions

**Missing:**
- ❌ Sign up functionality (currently just logs to console)
- ❌ Sign in functionality (currently just logs to console)
- ❌ Session management
- ❌ Auth state listener
- ❌ Protected routes (anyone can access `/spin` page)
- ❌ Logout functionality
- ❌ Auth state context/provider

**Current State:**
- Landing page has sign up/sign in UI but no backend connection
- No authentication checks anywhere
- No session persistence

---

### 4. Onboarding Backend Integration ⚠️ **CRITICAL**
**Status:** Partially implemented (UI only)
**Impact:** Onboarding data is lost, never saved to database

**What's Done:**
- ✅ Location autocomplete with coordinates
- ✅ All form fields collected

**What's Missing:**
- ❌ Save profile to `profiles` table on completion
- ❌ Save preferences to `user_preferences` table
- ❌ Upload photo to Supabase Storage
- ❌ Redirect to `/spin` after completion
- ❌ Error handling for save operations
- ❌ Loading states during save

**Current State:**
- Onboarding completes but only logs to console
- Data is lost when modal closes
- No navigation to `/spin` page

---

### 5. Spin Page Backend Integration ⚠️ **CRITICAL**
**Status:** Using hardcoded data
**Impact:** Shows fake profiles, cannot fetch real matches

**What's Missing:**
- ❌ Fetch user profile from Supabase on page load
- ❌ Fetch user preferences from Supabase on page load
- ❌ Fetch potential matches from database
- ❌ Profile discovery algorithm implementation
- ❌ Real-time match detection
- ❌ Vote tracking and saving
- ❌ Profile queue management (3 profiles: 1 active, 2 backup)

**Current State:**
- Hardcoded user: `{ name: "jason", bio: "...", photo: "...", age: 28, location: "new york, ny" }`
- Hardcoded profiles array
- Random matching logic (`Math.random() < 0.5`)
- No database queries

---

### 6. State Management ⚠️ **HIGH PRIORITY**
**Status:** Not implemented
**Impact:** Data doesn't persist across pages, no global auth state

**Missing:**
- ❌ Auth context/provider
- ❌ User profile context
- ❌ Preferences context
- ❌ Global state management (Context API or Zustand)

**Decision Needed:**
- Choose: Context API or Zustand?
- Recommendation: **Context API** (simpler, built-in, sufficient for MVP)

---

### 7. Protected Routes ⚠️ **HIGH PRIORITY**
**Status:** Not implemented
**Impact:** Anyone can access `/spin` and `/video-date` without authentication

**Missing:**
- ❌ Route protection middleware/component
- ❌ Redirect to landing page if not authenticated
- ❌ Check if user has completed onboarding
- ❌ Session validation on page load

**Required Routes to Protect:**
- `/spin` - Requires auth + completed onboarding
- `/video-date` - Requires auth + active match
- `/dashboard` - Requires auth

---

### 8. Image Upload System ⚠️ **HIGH PRIORITY**
**Status:** Not implemented
**Impact:** Profile pictures are not uploaded, only stored as base64 in state

**Missing:**
- ❌ Supabase Storage bucket creation
- ❌ Image upload functionality
- ❌ Image optimization/resizing
- ❌ Public URL generation
- ❌ Old image deletion when updating

**Current State:**
- Images converted to base64 data URLs
- Not uploaded anywhere
- Lost when page refreshes

---

### 9. LiveKit Integration ⚠️ **MEDIUM PRIORITY**
**Status:** Not implemented
**Impact:** Video dates cannot function

**Missing Packages:**
- ❌ `livekit-client` not installed
- ❌ `livekit-server-sdk` not installed (for token generation)

**Missing Implementation:**
- ❌ LiveKit room creation
- ❌ Token generation (server-side API route needed)
- ❌ Video call connection
- ❌ Video date session tracking in database

**Action Required:**
```bash
npm install livekit-client livekit-server-sdk
```

---

### 10. Matching System ⚠️ **MEDIUM PRIORITY** (Phase 2)
**Status:** Not implemented
**Impact:** Cannot match users, no real-time matching

**Missing:**
- ❌ Profile discovery query with filters
- ❌ Distance calculation using Haversine
- ❌ Vote tracking and storage
- ❌ Real-time match detection (Supabase Realtime)
- ❌ Match history
- ❌ Profile view tracking
- ❌ 24-hour exclusion logic for passed profiles

---

### 11. Video Date System ⚠️ **MEDIUM PRIORITY** (Phase 2)
**Status:** Partially implemented (UI only)
**Impact:** Video dates don't actually work

**What's Done:**
- ✅ UI for video date page
- ✅ Countdown timers
- ✅ Post-date modals

**What's Missing:**
- ❌ LiveKit integration
- ❌ Video call connection
- ❌ Session tracking in database
- ❌ Early exit handling
- ❌ Date completion tracking

---

### 12. Contact Exchange System ⚠️ **LOW PRIORITY** (Phase 3)
**Status:** Not implemented
**Impact:** Users cannot exchange contact details

**Missing:**
- ❌ Contact details form with checkboxes
- ❌ Encryption setup (pgcrypto)
- ❌ Contact storage
- ❌ Exchange logic (mutual yes after date)

---

### 13. Reporting & Moderation ⚠️ **LOW PRIORITY** (Phase 3)
**Status:** Not implemented
**Impact:** No way to report users

**Missing:**
- ❌ Report submission form
- ❌ Report categories (8 types)
- ❌ Automatic action triggers
- ❌ Block functionality

---

## 📦 Missing Packages

### Critical (Required for MVP)
```bash
npm install @supabase/supabase-js
```

### High Priority (Required for Video Dates)
```bash
npm install livekit-client livekit-server-sdk
```

### Optional (State Management)
```bash
# Only if choosing Zustand over Context API
npm install zustand
```

---

## 🗄️ Database Setup Required

### Immediate (Phase 1)
1. **Create `profiles` table** with all fields including:
   - `latitude`, `longitude` (DECIMAL)
   - `gender` (TEXT)
   - `is_online` (BOOLEAN)
   - `visibility_penalty` (INTEGER)
   - `last_active_at` (TIMESTAMP)

2. **Create `user_preferences` table**

3. **Set up RLS policies** for both tables

4. **Create `profile-pictures` storage bucket**

5. **Enable `pgcrypto` extension**

6. **Create `calculate_distance()` function**

### Phase 2 (Matching System)
7. **Create `votes` table**
8. **Create `matches` table**
9. **Create `profile_views` table**
10. **Set up Supabase Realtime** for match detection

### Phase 3 (Video Dates & Beyond)
11. **Create `video_dates` table**
12. **Create `date_ratings` table**
13. **Create `contact_details` table**
14. **Create `contact_exchanges` table**
15. **Create `reports` table**
16. **Create `blocked_users` table**

---

## 🔄 Implementation Priority

### **Phase 1: Foundation (CRITICAL - Do First)**
1. ✅ Install `@supabase/supabase-js`
2. ✅ Create Supabase client file
3. ✅ Create database schema (profiles, user_preferences)
4. ✅ Set up RLS policies
5. ✅ Create storage bucket
6. ✅ Implement authentication (sign up, sign in)
7. ✅ Add auth state management (Context)
8. ✅ Implement protected routes
9. ✅ Save onboarding data to Supabase
10. ✅ Fetch profile/preferences on spin page
11. ✅ Implement image upload

### **Phase 2: Core Features**
12. ✅ Install LiveKit packages
13. ✅ Create matching system tables
14. ✅ Implement profile discovery
15. ✅ Implement vote tracking
16. ✅ Implement real-time matching
17. ✅ Integrate LiveKit for video dates

### **Phase 3: Advanced Features**
18. ✅ Contact exchange system
19. ✅ Reporting system
20. ✅ Rating system

---

## 🚨 Critical Blockers

**Cannot proceed without:**
1. **Supabase client setup** - Nothing works without this
2. **Database schema** - Cannot store any data
3. **Authentication** - Users cannot sign up/in
4. **Onboarding save** - Data is lost

**These must be done first before anything else works.**

---

## 📝 Next Steps (Recommended Order)

1. **Install Supabase package**
   ```bash
   npm install @supabase/supabase-js
   ```

2. **Create Supabase client** (`src/lib/supabase.ts`)

3. **Create database schema** (run SQL in Supabase dashboard)

4. **Implement authentication** (sign up/sign in)

5. **Create auth context** (global auth state)

6. **Save onboarding data** (on completion)

7. **Fetch data on spin page** (profile + preferences)

8. **Add protected routes** (redirect if not authenticated)

9. **Implement image upload** (Supabase Storage)

10. **Then move to Phase 2** (matching, video dates, etc.)

---

## ✅ Summary

**Completed:** 2/15 major components
- Credentials collection ✅
- Location autocomplete ✅

**Missing:** 13/15 major components
- Supabase setup ❌
- Database schema ❌
- Authentication ❌
- Onboarding save ❌
- Spin page integration ❌
- State management ❌
- Protected routes ❌
- Image upload ❌
- LiveKit integration ❌
- Matching system ❌
- Video date backend ❌
- Contact exchange ❌
- Reporting ❌

**Status:** **~15% Complete** - Foundation work done, but core backend integration not started yet.

