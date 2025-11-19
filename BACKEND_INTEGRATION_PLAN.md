# Backend Integration Plan for Speed-Date Application

## ⚠️ Important: Use Exa Search MCP for All Implementation Steps

**Before implementing any step in this plan, use Exa Search MCP to get the latest, most accurate code examples and documentation.**

### How to Use Exa Search MCP:
1. For each implementation step, use `mcp_Exa_Search_get_code_context_exa` with a specific query
2. Example queries:
   - "Supabase client setup Next.js TypeScript"
   - "Supabase RLS policies authentication"
   - "Supabase Realtime subscriptions React hooks"
   - "Supabase database functions PostgreSQL triggers"
   - "LiveKit Cloud Next.js integration"
   - "Algolia Places autocomplete React"
3. Use the returned code examples as reference, but adapt them to this project's structure
4. Always verify against official Supabase documentation when in doubt

### Why Use Exa Search MCP:
- Gets the latest code examples and patterns
- Provides context-specific implementations
- Reduces errors by using proven patterns
- Ensures compatibility with current library versions

---

## Current State Analysis

### 1. Landing Page (`/page.tsx`)
- Sign in/sign up modal
- Multi-step onboarding collecting: name, age, bio, photo, location, preferences (minAge, maxAge, maxDistance)
- Data stored in local `onboardingData` state
- On completion, logs to console; no navigation or persistence

### 2. Spin Page (`/spin/page.tsx`)
- Hardcoded user data: `{ name: "jason", bio: "...", photo: "...", age: 28, location: "new york, ny" }`
- Hardcoded filter state: `minAge: 18, maxAge: 30, location: "", maxDistance: 50`
- Profile modal shows hardcoded user data
- Filter modal shows hardcoded filter state
- No connection to onboarding data

### 3. Missing Pieces
- No backend/API layer
- No authentication system
- No database/persistence
- No state management (data doesn't flow between pages)
- No image upload/storage solution
- No session management

## Key Decisions Made

### ✅ Backend Stack
- **Decision: Supabase** - Using Supabase for complete backend solution (PostgreSQL database, authentication, storage, and auto-generated REST API)

### ✅ Database
- **Decision: Supabase PostgreSQL** - Supabase provides PostgreSQL database with automatic REST API generation

### ✅ Authentication
- **Decision: Supabase Auth** - Using Supabase's built-in authentication system with email/password (JWT tokens managed by Supabase)

### ✅ Image Storage
- **Decision: Supabase Storage** - Using Supabase Storage buckets for profile picture uploads

### ⏳ State Management
- **Pending: Context API, Zustand, or server-side fetching?** - Need decision

### ✅ API Structure
- **Decision: Supabase REST API** - Using Supabase's auto-generated REST API via JavaScript client SDK

### ⏳ User Flow
- **Pending: After onboarding completion, redirect to `/spin`?** - Need confirmation
- **Pending: Should sign-in users skip onboarding if they already have a profile?** - Need confirmation

### ⏳ Data Flow
- **Pending: Should profile/filter edits update backend immediately or batch on save?** - Need decision

## Supabase Implementation Plan

**"Implement a complete Supabase backend integration for the speed-date application with the following requirements:**

### 1. Supabase Setup
- Install `@supabase/supabase-js` package
- Create Supabase client configuration file
- Set up environment variables for Supabase URL and anon key
- Initialize Supabase client for use across the application

### 2. Database Schema Setup
- Create `profiles` table in Supabase with columns:
  - `id` (UUID, references auth.users, primary key)
  - `name` (text)
  - `age` (integer)
  - `bio` (text)
  - `photo` (text, URL to Supabase Storage)
  - `location` (text)
  - `created_at` (timestamp)
  - `updated_at` (timestamp)
- Create `user_preferences` table with columns:
  - `id` (UUID, primary key)
  - `user_id` (UUID, references profiles.id, unique)
  - `min_age` (integer)
  - `max_age` (integer)
  - `max_distance` (integer)
  - `updated_at` (timestamp)
- Set up Row Level Security (RLS) policies:
  - Users can only read/update their own profile
  - Users can only read/update their own preferences

### 3. Authentication & User Management
- Use Supabase Auth for user registration (`supabase.auth.signUp()`)
- Use Supabase Auth for user login (`supabase.auth.signInWithPassword()`)
- Use Supabase Auth for session management (`supabase.auth.getSession()`)
- Use Supabase Auth for logout (`supabase.auth.signOut()`)
- Implement protected routes using Supabase session check
- Set up auth state listener to track user authentication status

### 4. User Profile System
- On onboarding completion, insert/update profile in `profiles` table using `supabase.from('profiles').upsert()`
- Fetch current user's profile using `supabase.from('profiles').select().eq('id', userId).single()`
- Update user profile (bio, location, photo) using `supabase.from('profiles').update()`
- Link profile to auth user via `auth.users.id`

### 5. Filter Preferences
- Save user preferences during onboarding using `supabase.from('user_preferences').upsert()`
- Fetch user preferences using `supabase.from('user_preferences').select().eq('user_id', userId).single()`
- Update preferences using `supabase.from('user_preferences').update()`
- Ensure filter modal displays and updates these preferences

### 6. Image Upload (Supabase Storage)
- Create `profile-pictures` storage bucket in Supabase
- Set up bucket policies (public read, authenticated write)
- Upload profile pictures using `supabase.storage.from('profile-pictures').upload()`
- Get public URL using `supabase.storage.from('profile-pictures').getPublicUrl()`
- Handle image optimization and resizing if needed

### 7. Frontend Integration
- After onboarding completion, save data to Supabase and redirect to `/spin` page
- On spin page load, fetch and display real user profile data from Supabase
- On spin page load, fetch and display real filter preferences from Supabase
- Update profile modal to save changes to Supabase when user edits bio/location/photo
- Update filter modal to save changes to Supabase when user updates preferences
- Implement loading states and error handling for all Supabase operations

### 8. State Management
- Use React Context API or Zustand to manage authenticated user state globally
- Store Supabase client instance in context/provider
- Store user profile and preferences in global state after fetching
- Ensure data persists across page navigation
- Sync auth state with Supabase auth state listener

### 9. Session Management
- Supabase automatically handles session persistence (stored in localStorage)
- Add route protection - redirect to landing page if not authenticated
- Use Supabase auth state to check if user is logged in
- Implement logout using `supabase.auth.signOut()`

### Technical Stack (Confirmed)
- **Backend: Supabase** (PostgreSQL database, authentication, storage, REST API)
- **Database: Supabase PostgreSQL** (with Row Level Security)
- **Auth: Supabase Auth** (email/password with JWT tokens)
- **Image Storage: Supabase Storage** (profile-pictures bucket)
- **State: React Context API or Zustand** (pending decision)
- **Client SDK: @supabase/supabase-js**

### Implementation Priority
1. Set up Supabase project and install dependencies
2. Create database schema (profiles, user_preferences tables)
3. Set up Supabase client and authentication
4. Implement sign up/sign in with Supabase Auth
5. Integrate onboarding completion with Supabase profile creation
6. Update spin page to fetch and display real data from Supabase
7. Add update functionality for profile and filters
8. Implement image upload to Supabase Storage"

## User Flow Requirements

### Sign Up Flow
1. User clicks "start now" on landing page
2. User selects "sign up" tab
3. User enters email, password, retype password
4. User clicks "continue"
5. User goes through onboarding steps:
   - Step 1: Name
   - Step 2: Gender (male, female, non-binary, prefer not to say)
   - Step 3: Age
   - Step 4: Bio
   - Step 5: Photo upload
   - Step 6: Location (with autocomplete - captures lat/lng)
   - Step 7: Preferences (min age, max age, max distance, gender preference)
6. On "complete", data is saved to backend:
   - Create profile in `profiles` table (with gender, location, coordinates)
   - Create preferences in `user_preferences` table (with gender_preference)
   - Set `onboarding_completed = TRUE`
7. User is redirected to `/spin` page
8. User is authenticated and session is established

### Sign In Flow
1. User clicks "start now" on landing page
2. User selects "sign in" tab
3. User enters email and password
4. User clicks "continue"
5. Authenticate with Supabase Auth
6. Check if profile exists and `onboarding_completed = TRUE`:
   - If profile exists and `onboarding_completed = TRUE`: redirect to `/spin`
   - If profile doesn't exist or `onboarding_completed = FALSE`: redirect to onboarding flow
7. User is authenticated and session is established

### Spin Page Flow
1. On page load, fetch user profile data from backend
2. On page load, fetch user filter preferences from backend
3. Profile modal displays real user data from backend
4. Filter modal displays real filter preferences from backend
5. When user edits profile, save changes to backend immediately
6. When user updates filters, save changes to backend immediately

## Supabase Database Schema

### Profiles Table
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  age INTEGER NOT NULL,
  bio TEXT,
  photo TEXT, -- URL to Supabase Storage
  location TEXT, -- City name or location string
  latitude DECIMAL(10, 8), -- Precise lat coordinate for distance calculation
  longitude DECIMAL(11, 8), -- Precise lng coordinate for distance calculation
  gender TEXT CHECK (gender IN ('male', 'female', 'non-binary', 'prefer_not_to_say') OR gender IS NULL), -- User's gender
  is_online BOOLEAN DEFAULT FALSE, -- Track online/offline status
  visibility_penalty INTEGER DEFAULT 0, -- Penalty for early exits (reduces visibility)
  onboarding_completed BOOLEAN DEFAULT FALSE, -- Track if user completed onboarding
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Policy: Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Policy: Authenticated users can read other profiles for matching (CRITICAL for matching system)
-- Excludes blocked users and ensures user is authenticated
CREATE POLICY "Users can read profiles for matching"
  ON profiles FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND
    -- Exclude users who blocked the current user
    id NOT IN (
      SELECT blocker_id 
      FROM blocked_users 
      WHERE blocked_user_id = auth.uid()
    )
  );
```

-- Indexes for performance
CREATE INDEX idx_profiles_location ON profiles(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX idx_profiles_online ON profiles(is_online, last_active_at) WHERE is_online = TRUE;
CREATE INDEX idx_profiles_gender ON profiles(gender) WHERE gender IS NOT NULL;
CREATE INDEX idx_profiles_age ON profiles(age);
CREATE INDEX idx_profiles_onboarding ON profiles(onboarding_completed) WHERE onboarding_completed = TRUE;
```

### User Preferences Table
```sql
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  min_age INTEGER NOT NULL DEFAULT 18,
  max_age INTEGER NOT NULL DEFAULT 30,
  max_distance INTEGER NOT NULL DEFAULT 50,
  gender_preference TEXT DEFAULT 'all' CHECK (gender_preference IN ('male', 'female', 'non-binary', 'all')), -- Who they want to match with
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own preferences
CREATE POLICY "Users can read own preferences"
  ON user_preferences FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can update their own preferences
CREATE POLICY "Users can update own preferences"
  ON user_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own preferences
CREATE POLICY "Users can insert own preferences"
  ON user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

### Supabase Storage Bucket
- **Bucket Name:** `profile-pictures`
- **Public:** Yes (for reading)
- **File Size Limit:** 5MB (configurable)
- **Allowed MIME Types:** image/jpeg, image/png, image/webp

## Supabase Client Methods (JavaScript SDK)

### Authentication Methods
```typescript
// Sign up
await supabase.auth.signUp({
  email: string,
  password: string
})

// Sign in
await supabase.auth.signInWithPassword({
  email: string,
  password: string
})

// Sign out
await supabase.auth.signOut()

// Get current session
const { data: { session } } = await supabase.auth.getSession()

// Listen to auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  // Handle auth state changes
})
```

### Profile Methods
```typescript
// Create/update profile
await supabase.from('profiles').upsert({
  id: userId,
  name: string,
  age: number,
  bio: string,
  photo: string,
  location: string,
  updated_at: new Date().toISOString()
})

// Get current user's profile
const { data, error } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', userId)
  .single()

// Update profile
await supabase
  .from('profiles')
  .update({ bio, location, photo, updated_at: new Date().toISOString() })
  .eq('id', userId)
```

### Preferences Methods
```typescript
// Create/update preferences
await supabase.from('user_preferences').upsert({
  user_id: userId,
  min_age: number,
  max_age: number,
  max_distance: number,
  updated_at: new Date().toISOString()
})

// Get current user's preferences
const { data, error } = await supabase
  .from('user_preferences')
  .select('*')
  .eq('user_id', userId)
  .single()

// Update preferences
await supabase
  .from('user_preferences')
  .update({ min_age, max_age, max_distance, updated_at: new Date().toISOString() })
  .eq('user_id', userId)
```

### Storage Methods
```typescript
// Upload profile picture
const fileExt = file.name.split('.').pop()
const fileName = `${userId}-${Date.now()}.${fileExt}`
const { data, error } = await supabase.storage
  .from('profile-pictures')
  .upload(fileName, file)

// Get public URL
const { data: { publicUrl } } = supabase.storage
  .from('profile-pictures')
  .getPublicUrl(fileName)

// Delete old profile picture (optional)
await supabase.storage
  .from('profile-pictures')
  .remove([oldFileName])
```

## All Required Credentials & API Keys

### Complete Credentials List

You'll need to obtain credentials from the following services:

#### 1. Supabase (Required - Backend)
**Where to get:** https://supabase.com
- Sign up for free account
- Create a new project
- Go to Project Settings → API

**Credentials needed:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

**What you get:**
- Project URL (found in Project Settings → API → Project URL)
- Anon/Public Key (found in Project Settings → API → Project API keys → anon public)

**Cost:** Free tier available (500MB database, 1GB file storage, 2GB bandwidth)

---

#### 2. LiveKit Cloud (Required - Video Calling)
**Where to get:** https://cloud.livekit.io
- Sign up for free account
- Create a new project
- Go to Settings → Keys

**Credentials needed:**
```env
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key_here
LIVEKIT_API_SECRET=your_api_secret_here
```

**What you get:**
- Server URL (found in project dashboard)
- API Key (found in Settings → Keys)
- API Secret (found in Settings → Keys - keep this secret!)

**Cost:** Free tier available (10,000 participant minutes/month)

---

#### 3. Location/Geocoding Service (Required - Location Autocomplete)

**✅ DECISION: Algolia Places** (Simpler setup, no billing required, sufficient for MVP)

##### Algolia Places (Chosen)
**Where to get:** https://www.algolia.com
- Sign up for free account (no credit card required)
- Create a new application
- Go to Settings → API Keys
- Copy Application ID and Search API Key

**Credentials needed:**
```env
NEXT_PUBLIC_ALGOLIA_APP_ID=your_app_id_here
NEXT_PUBLIC_ALGOLIA_PLACES_API_KEY=your_search_api_key_here
```

**Cost:**
- Free tier: 1,000 requests/day (sufficient for MVP)
- After that: $0.50 per 1,000 requests
- **No billing setup required** - much simpler than Google Places

**Why Algolia over Google Places:**
- ✅ No billing account required
- ✅ Simpler setup (just API keys)
- ✅ Free tier sufficient for development/MVP
- ✅ Easy integration with autocomplete component
- ✅ Returns lat/lng coordinates automatically

---

##### Alternative Options (Not Chosen)

**Option A: Google Places API**
- More complex setup (requires billing)
- Better coverage but overkill for MVP
- Cost: $200 free credit/month, then pay-as-you-go

**Option B: Mapbox**
- Good free tier (100K requests/month)
- Requires billing setup
- Cost: Free tier, then $0.75 per 1,000 requests

---

### Complete .env.local File Template

Create a `.env.local` file in your project root with:

```env
# ============================================
# REQUIRED CREDENTIALS
# ============================================

# Supabase (Backend - Required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# LiveKit (Video Calling - Required)
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key_here
LIVEKIT_API_SECRET=your_livekit_api_secret_here

# Location Service - Algolia Places (Chosen)
# Get from: https://dashboard.algolia.com/account/api-keys
# Free tier: 1,000 requests/day (no billing required)
NEXT_PUBLIC_ALGOLIA_APP_ID=your_algolia_app_id_here
NEXT_PUBLIC_ALGOLIA_PLACES_API_KEY=your_algolia_search_api_key_here

# Alternative options (not chosen):
# Google Places: Requires billing, more complex
# NEXT_PUBLIC_GOOGLE_PLACES_API_KEY=your_google_api_key_here
# Mapbox: Requires billing setup
# NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your_mapbox_token_here
```

---

### Credentials Summary Table

| Service | Purpose | Required? | Free Tier | Where to Get |
|---------|---------|-----------|-----------|--------------|
| **Supabase** | Backend (Database, Auth, Storage) | ✅ Yes | 500MB DB, 1GB storage | supabase.com |
| **LiveKit** | Video calling | ✅ Yes | 10K minutes/month | cloud.livekit.io |
| **Algolia Places** | Location autocomplete | ✅ Yes (chosen) | 1K requests/day | algolia.com |
| **Google Places** | Location autocomplete | ❌ No (too complex) | $200 credit/month | console.cloud.google.com |
| **Mapbox** | Location autocomplete | ❌ No (not chosen) | 100K requests/month | account.mapbox.com |

---

### Setup Steps Summary

1. **Supabase Setup:**
   - Sign up at supabase.com
   - Create new project
   - Copy Project URL and Anon Key

2. **LiveKit Setup:**
   - Sign up at cloud.livekit.io
   - Create new project
   - Copy Server URL, API Key, and API Secret

3. **Location Service Setup:**
   - ✅ **Algolia Places** (chosen - simpler, no billing)
   - Sign up at algolia.com (free, no credit card)
   - Get Application ID and Search API Key
   - Add to `.env.local`

4. **Add to Project:**
   - Create `.env.local` file in project root
   - Add all credentials
   - **Never commit `.env.local` to git** (it's already in `.gitignore`)

---

### Security Notes

- ✅ **Public keys** (NEXT_PUBLIC_*) are safe to expose in client-side code
- 🔒 **Secret keys** (LIVEKIT_API_SECRET) should NEVER be exposed client-side
- 🔒 Keep all credentials private - don't share or commit to git
- 🔒 Restrict API keys when possible (Algolia keys are public by design for frontend use)

## Required Packages

```bash
# Supabase client
npm install @supabase/supabase-js

# LiveKit for video calling
npm install livekit-client

# Optional: For LiveKit token generation (if done server-side)
npm install livekit-server-sdk
```

## Implementation Checklist

### Phase 1: Supabase Setup
- [ ] **Use Exa Search MCP:** Query "Supabase client setup Next.js TypeScript App Router"
- [ ] Create Supabase project
- [ ] Install `@supabase/supabase-js`
- [ ] Create Supabase client configuration
- [ ] Set up environment variables

### Phase 2: Database Setup
- [ ] **Use Exa Search MCP:** Query "Supabase PostgreSQL table creation RLS policies"
- [ ] Create `profiles` table (with latitude, longitude, gender, onboarding_completed fields)
- [ ] Add gender validation constraint to profiles table
- [ ] Create `user_preferences` table (with gender_preference field)
- [ ] **Use Exa Search MCP:** Query "Supabase RLS policies multiple conditions authenticated users"
- [ ] Set up Row Level Security policies:
  - [ ] Users can read/update their own profile
  - [ ] **CRITICAL:** Users can read other profiles for matching (excludes blocked users)
  - [ ] Users can read/update their own preferences
- [ ] **Use Exa Search MCP:** Query "PostgreSQL indexes performance optimization"
- [ ] Create all database indexes for performance (profiles, votes, matches, profile_views, blocked_users)
- [ ] **Use Exa Search MCP:** Query "Supabase Storage bucket creation public read authenticated write"
- [ ] Create `profile-pictures` storage bucket
- [ ] Configure bucket policies
- [ ] **Use Exa Search MCP:** Query "PostgreSQL Haversine distance calculation function"
- [ ] Create Haversine distance calculation function

### Phase 3: Authentication
- [ ] **Use Exa Search MCP:** Query "Supabase Auth sign up Next.js React hooks"
- [ ] Implement sign up functionality
- [ ] **Use Exa Search MCP:** Query "Supabase Auth sign in password Next.js"
- [ ] Implement sign in functionality
- [ ] **Use Exa Search MCP:** Query "Supabase Auth state listener React useEffect"
- [ ] Set up auth state listener
- [ ] **Use Exa Search MCP:** Query "Next.js protected routes middleware authentication"
- [ ] Implement protected routes
- [ ] **Use Exa Search MCP:** Query "Supabase Auth sign out logout"
- [ ] Add logout functionality

### Phase 4: Profile System
- [ ] Add gender selection step to onboarding (step 2, after name) - ✅ Already implemented
- [ ] **Use Exa Search MCP:** Query "Algolia Places autocomplete React TypeScript coordinates"
- [ ] Integrate location autocomplete/geocoding in onboarding step 6 - ✅ Already implemented
- [ ] Ensure latitude/longitude are captured during onboarding - ✅ Already implemented
- [ ] Add gender_preference selection to preferences step (step 7)
- [ ] **Use Exa Search MCP:** Query "Supabase insert upsert profile data React"
- [ ] Create profile on onboarding completion (with gender, coordinates)
- [ ] Set `onboarding_completed = TRUE` when onboarding finishes
- [ ] **Use Exa Search MCP:** Query "Supabase fetch single row select React hooks"
- [ ] Fetch profile on spin page load
- [ ] **Use Exa Search MCP:** Query "Supabase update row React form validation"
- [ ] Update profile when user edits (validate coordinates if location changes)
- [ ] **Use Exa Search MCP:** Query "Supabase Storage upload image React file input"
- [ ] Implement image upload to Supabase Storage

### Phase 5: Preferences System
- [ ] **Use Exa Search MCP:** Query "Supabase upsert preferences React form"
- [ ] Save preferences on onboarding completion
- [ ] **Use Exa Search MCP:** Query "Supabase fetch user preferences React"
- [ ] Fetch preferences on spin page load
- [ ] **Use Exa Search MCP:** Query "Supabase update preferences React state management"
- [ ] Update preferences when user changes filters

### Phase 6: Frontend Integration
- [ ] **Use Exa Search MCP:** Query "Supabase Auth integration Next.js landing page"
- [ ] Update landing page to use Supabase Auth
- [ ] **Add gender selection to onboarding step 2** - ✅ Already implemented
- [ ] **Add location autocomplete to onboarding step 6** - ✅ Already implemented
- [ ] **Add gender_preference selection to preferences step (step 7)**
- [ ] **Validate location coordinates before allowing onboarding completion** - ✅ Already implemented
- [ ] **Use Exa Search MCP:** Query "Supabase save onboarding data React form submission"
- [ ] Update onboarding to save to Supabase (with gender, coordinates, gender_preference)
- [ ] Set `onboarding_completed = TRUE` on onboarding completion
- [ ] **Use Exa Search MCP:** Query "Supabase check user profile exists redirect flow"
- [ ] Update sign-in flow to check `onboarding_completed` status
- [ ] **Use Exa Search MCP:** Query "Supabase fetch data React page load useEffect"
- [ ] Update spin page to fetch from Supabase
- [ ] **Use Exa Search MCP:** Query "React loading states error handling Supabase"
- [ ] Add loading states and error handling
- [ ] **Use Exa Search MCP:** Query "React Context API vs Zustand state management Supabase"
- [ ] Implement state management (Context/Zustand)

## Location Input & Geocoding Solution

### Problem
Users type location as free text during onboarding, which leads to:
- Misspellings and typos
- Inconsistent formats ("New York" vs "NYC" vs "New York City")
- No way to get precise coordinates (lat/lng) needed for distance calculation
- Poor matching accuracy due to inconsistent location data

### Solution: Location Autocomplete with Geocoding

**✅ DECISION: Algolia Places** (Chosen - simpler setup, no billing required)

**Algolia Places** (Chosen)
- ✅ Very easy to integrate
- ✅ Good free tier (1,000 requests/day)
- ✅ Provides autocomplete + coordinates
- ✅ No billing setup required
- ✅ Returns standardized location + lat/lng coordinates

**Alternative Services (Not Chosen):**
1. **Google Places Autocomplete**
   - Most accurate but requires billing setup
   - More complex configuration
   - Pay-as-you-go pricing

2. **Mapbox Geocoding API**
   - Excellent accuracy
   - Good free tier (100,000 requests/month)
   - Requires billing setup

**Implementation Approach:**
- Replace free text input with location autocomplete component
- As user types, show location suggestions
- When user selects a location:
  - Store standardized location name (e.g., "New York, NY, USA")
  - Automatically get and store latitude/longitude coordinates
  - Store city, state, country if needed for display
- This ensures accurate distance calculation using Haversine formula

**Required Changes:**
1. Add location autocomplete library to onboarding step 5
2. Update profiles table to store both `location` (text) and `latitude`/`longitude` (coordinates)
3. Validate that coordinates are captured before allowing onboarding completion
4. Use coordinates for distance calculation in matching algorithm

**Packages Needed:**
```bash
# Algolia Places (Chosen)
npm install algoliasearch
```

**Environment Variables:**
```env
# Algolia Places (Chosen)
NEXT_PUBLIC_ALGOLIA_APP_ID=your_algolia_app_id
NEXT_PUBLIC_ALGOLIA_PLACES_API_KEY=your_algolia_search_api_key
```

## Missing Backend Integrations

### 1. Matching System
**Current State:** Hardcoded profiles, random matching logic
**What's Needed:**
- **Profile Discovery Algorithm**: Fetch potential matches based on user preferences (age range, distance, location)
- **Vote Tracking**: Store user votes (yes/pass) on each profile
- **Match Detection**: Real-time detection when both users vote "yes" on each other
- **Match History**: Track all matches between users
- **Avoid Showing Same Profiles**: Track which profiles user has already seen/voted on
- **Real-time Matching**: Use Supabase Realtime to detect matches instantly

**Database Tables Needed:**
- `votes` - Store user votes on profiles
- `matches` - Store successful matches between users
- `profile_views` - Track which profiles user has seen (to avoid duplicates)

### 2. Video Date System
**Current State:** Hardcoded partner data, no session tracking
**What's Needed:**
- **Video Date Sessions**: Create and track video date sessions when users match
- **Session State Management**: Track if date is in countdown, active, or completed
- **Date Completion Tracking**: Store date duration, completion status
- **WebRTC/Signaling**: Handle video call setup (may need external service like Agora, Twilio, or WebRTC)
- **Session Timeout**: Handle cases where one user leaves early

**Database Tables Needed:**
- `video_dates` - Store video date sessions
- `date_participants` - Track who participated in each date

### 3. Rating & Feedback System
**Current State:** Console logs only
**What's Needed:**
- **Date Ratings**: Store star ratings (1-5) for each video date
- **Feedback Text**: Store optional feedback text
- **Rating History**: Track all ratings given/received
- **Average Rating Calculation**: Calculate user's average rating

**Database Tables Needed:**
- `date_ratings` - Store ratings and feedback for video dates

### 4. Contact Details Exchange System
**Current State:** Simulated contact exchange
**What's Needed:**
- **Contact Details Storage**: Securely store user contact details (email, phone, social media)
- **Exchange Logic**: Only exchange contacts when both users say "yes" after video date
- **Privacy Controls**: Allow users to choose which contact methods to share
- **Contact History**: Track all contact exchanges

**Database Tables Needed:**
- `contact_details` - Store user contact information
- `contact_exchanges` - Track when contacts were exchanged between matched users

### 5. Reporting & Moderation System
**Current State:** Console logs only
**What's Needed:**
- **Report Storage**: Store user reports with reasons
- **Report Types**: Categorize reports (harassment, inappropriate behavior, spam, etc.)
- **Moderation Queue**: Track reports that need review
- **User Blocking**: Allow users to block other users
- **Account Actions**: Track warnings, suspensions, bans

**Database Tables Needed:**
- `reports` - Store user reports
- `blocked_users` - Track blocked user relationships

### 6. Profile Discovery & Spin Algorithm
**Current State:** Hardcoded profile array, random selection
**What's Needed:**
- **Smart Profile Fetching**: Query profiles based on:
  - User's age preferences (min_age, max_age)
  - Distance preferences (max_distance)
  - Location matching (if location data available)
  - Exclude already viewed/voted profiles
  - Exclude blocked users
  - Exclude users who already passed on current user
- **Spin Algorithm**: Implement logic to show one profile at a time
- **Profile Queue Management**: Maintain queue of potential matches
- **Location-based Matching**: Calculate distance between users (if location data available)

**Database Queries Needed:**
- Complex query joining profiles, preferences, votes, and location data
- Efficient pagination for profile discovery

### 7. Real-time Features
**Current State:** No real-time functionality
**What's Needed:**
- **Real-time Match Notifications**: Notify users instantly when they match
- **Real-time Vote Updates**: Update match status in real-time when other user votes
- **Real-time Video Date Status**: Track if partner is online/ready for video date
- **Presence System**: Track user online/offline status

**Supabase Features:**
- Use Supabase Realtime subscriptions for match detection
- Use Supabase Realtime for video date session updates

### 8. Analytics & Statistics
**Current State:** No tracking
**What's Needed:**
- **User Stats**: Track matches, dates completed, ratings received
- **Platform Stats**: Overall platform metrics
- **Activity Tracking**: Track user engagement

**Database Tables Needed:**
- `user_statistics` - Store aggregated user stats (can be computed or stored)

## Complete Database Schema (Including Missing Features)

### Votes Table
```sql
CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('yes', 'pass')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(voter_id, profile_id)
);

-- RLS: Users can only see their own votes
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own votes"
  ON votes FOR ALL
  USING (auth.uid() = voter_id);

-- Policy: Users can see votes on their profile (needed for "exclude users who passed on current user")
CREATE POLICY "Users can see votes on their profile"
  ON votes FOR SELECT
  USING (auth.uid() = profile_id);
```

-- Indexes for votes table
CREATE INDEX idx_votes_voter ON votes(voter_id, profile_id);
CREATE INDEX idx_votes_profile ON votes(profile_id, voter_id);
CREATE INDEX idx_votes_created ON votes(created_at);

### Matches Table
```sql
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  matched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'video_date_scheduled', 'video_date_completed', 'contact_exchanged', 'unmatched')),
  UNIQUE(user1_id, user2_id),
  CHECK (user1_id < user2_id) -- Ensure consistent ordering
);

-- RLS: Users can see matches they're part of
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see own matches"
  ON matches FOR SELECT
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);
```

-- Indexes for matches table
CREATE INDEX idx_matches_user1 ON matches(user1_id, user2_id);
CREATE INDEX idx_matches_user2 ON matches(user2_id, user1_id);
CREATE INDEX idx_matches_status ON matches(status) WHERE status != 'unmatched';

### Profile Views Table
```sql
CREATE TABLE profile_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  viewed_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(viewer_id, viewed_profile_id)
);

-- Indexes for profile_views table
CREATE INDEX idx_profile_views_recent ON profile_views(viewer_id, viewed_at);
CREATE INDEX idx_profile_views_viewer ON profile_views(viewer_id, viewed_profile_id);
CREATE INDEX idx_profile_views_viewed ON profile_views(viewed_profile_id);

-- RLS: Users can only see their own view history
ALTER TABLE profile_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see own views"
  ON profile_views FOR ALL
  USING (auth.uid() = viewer_id);

### Video Dates Table
```sql
CREATE TABLE video_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user1_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  livekit_room_name TEXT, -- LiveKit room identifier
  livekit_token_user1 TEXT, -- LiveKit token for user1
  livekit_token_user2 TEXT, -- LiveKit token for user2
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  ended_by_user_id UUID REFERENCES profiles(id), -- Track who ended early (if applicable)
  status TEXT DEFAULT 'countdown' CHECK (status IN ('countdown', 'active', 'completed', 'ended_early')),
  outcome TEXT CHECK (outcome IN ('yes', 'pass')), -- Final outcome after date
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS: Users can see video dates they're part of
ALTER TABLE video_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see own video dates"
  ON video_dates FOR SELECT
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);
```

### Date Ratings Table
```sql
CREATE TABLE date_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_date_id UUID NOT NULL REFERENCES video_dates(id) ON DELETE CASCADE,
  rater_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rated_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(video_date_id, rater_id, rated_user_id)
);

-- RLS: Users can only rate dates they participated in
ALTER TABLE date_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own ratings"
  ON date_ratings FOR ALL
  USING (auth.uid() = rater_id);
```

### Contact Details Table
```sql
CREATE TABLE contact_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  -- Encrypted fields (use pgcrypto extension for encryption)
  email_encrypted BYTEA, -- Encrypted email
  phone_encrypted BYTEA, -- Encrypted phone
  instagram_encrypted BYTEA, -- Encrypted Instagram handle
  whatsapp_encrypted BYTEA, -- Encrypted WhatsApp number
  -- User preferences for which methods to share
  share_email BOOLEAN DEFAULT FALSE,
  share_phone BOOLEAN DEFAULT FALSE,
  share_instagram BOOLEAN DEFAULT FALSE,
  share_whatsapp BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS: Users can only see/manage their own contact details
ALTER TABLE contact_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own contacts"
  ON contact_details FOR ALL
  USING (auth.uid() = user_id);
```

### Contact Exchanges Table
```sql
CREATE TABLE contact_exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_date_id UUID NOT NULL REFERENCES video_dates(id) ON DELETE CASCADE,
  user1_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user1_shared BOOLEAN DEFAULT FALSE,
  user2_shared BOOLEAN DEFAULT FALSE,
  exchanged_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(video_date_id, user1_id, user2_id)
);

-- RLS: Users can see exchanges they're part of
ALTER TABLE contact_exchanges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see own exchanges"
  ON contact_exchanges FOR SELECT
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);
```

### Reports Table
```sql
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  video_date_id UUID REFERENCES video_dates(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN (
    'inappropriate_behaviour',
    'harassment',
    'sexual_content',
    'camera_refusal',
    'fake_profile',
    'underage_suspicion',
    'scam_attempts',
    'hate_speech'
  )),
  details TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  auto_action_taken TEXT, -- Track automatic actions (shadow_block, suspension, etc.)
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS: Users can create reports, admins can view all
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create reports"
  ON reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can see own reports"
  ON reports FOR SELECT
  USING (auth.uid() = reporter_id);
```

### Blocked Users Table
```sql
CREATE TABLE blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_user_id),
  CHECK (blocker_id != blocked_user_id)
);

-- RLS: Users can manage their own blocks
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own blocks"
  ON blocked_users FOR ALL
  USING (auth.uid() = blocker_id);
```

-- Indexes for blocked_users table
CREATE INDEX idx_blocked_users_blocker ON blocked_users(blocker_id, blocked_user_id);
CREATE INDEX idx_blocked_users_blocked ON blocked_users(blocked_user_id);

## Implementation Priority for Missing Features

### Phase 7: Matching System
- [ ] **Use Exa Search MCP:** Query "Supabase create tables votes matches profile views"
- [ ] Create votes, matches, profile_views tables
- [ ] **Use Exa Search MCP:** Query "Supabase RLS policy users see votes on their profile"
- [ ] **Add RLS policy to votes table: "Users can see votes on their profile"**
- [ ] Create all indexes for votes, matches, profile_views tables
- [ ] **Use Exa Search MCP:** Query "PostgreSQL function check mutual match votes"
- [ ] **Create database function: `check_mutual_match(user1_id, user2_id)`**
- [ ] **Use Exa Search MCP:** Query "PostgreSQL trigger auto match detection vote insert"
- [ ] **Create database trigger: `handle_vote_insert()` for auto-match detection**
- [ ] **Use Exa Search MCP:** Query "PostgreSQL function discover profiles distance calculation bidirectional"
- [ ] **Create database function: `discover_profiles(current_user_id, limit_count)`**
- [ ] Implement profile discovery query with strict filters:
  - Age range (from user_preferences)
  - Distance (from user_preferences.max_distance)
  - **Gender preference (from user_preferences.gender_preference)**
  - **Bidirectional preference check (both users must match each other's preferences)**
  - Exclude permanent matches, users in dates, offline users
  - Exclude users who passed on current user (using votes table)
  - Exclude blocked users (both directions)
  - 24-hour exclusion for passed profiles
- [ ] Implement profile queue (3 profiles: 1 active, 2 backups)
- [ ] Implement prioritization: distance → activity → freshness → fairness boost
- [ ] Implement fairness boost calculation (users with < 5 matches get priority)
- [ ] **Use Exa Search MCP:** Query "Supabase insert vote React immediate save"
- [ ] Implement vote tracking (yes/pass) with immediate save to database
- [ ] **Use Exa Search MCP:** Query "Supabase Realtime subscriptions React hooks matches"
- [ ] **Use Exa Search MCP:** Query "PostgreSQL trigger notify Supabase Realtime"
- [ ] Implement real-time match detection using **BOTH**:
  - Supabase Realtime subscriptions (client-side)
  - Database trigger + notification (server-side, more reliable)
- [ ] **Use Exa Search MCP:** Query "React filter softening empty pool progressive relaxation"
- [ ] Implement filter softening when pool is empty:
  1. Increase distance by 50%
  2. Expand age range by ±5 years
  3. Remove gender preference (show all)
  4. Show offline users (last resort)
- [ ] Implement "waiting for match" UI state after voting yes
- [ ] Implement match timeout (10 seconds) before auto-spin
- [ ] Update spin page to fetch real profiles from database
- [ ] Implement instant redirect to video-date when both vote yes
- [ ] Handle edge cases: simultaneous votes, network failures, user leaving

### Phase 8: Video Date System
- [ ] **Use Exa Search MCP:** Query "Supabase create video dates table LiveKit fields"
- [ ] Create video_dates table with LiveKit fields
- [ ] Set up LiveKit Cloud account and get API keys - ✅ Already done
- [ ] **Use Exa Search MCP:** Query "LiveKit create room generate token Next.js API route"
- [ ] Create video date session when users match
- [ ] Generate LiveKit room and tokens for both users
- [ ] **Use Exa Search MCP:** Query "LiveKit client SDK React video call integration"
- [ ] Integrate LiveKit client SDK in video-date page
- [ ] **Use Exa Search MCP:** Query "LiveKit track connection state React hooks"
- [ ] Track video date state (countdown, active, completed)
- [ ] **Use Exa Search MCP:** Query "LiveKit handle early exit disconnect both users"
- [ ] Handle early exit (both users return to spin, mark as pass, apply visibility penalty)
- [ ] **Use Exa Search MCP:** Query "LiveKit date completion timeout scenarios"
- [ ] Handle date completion and timeout scenarios

### Phase 9: Rating & Feedback
- [ ] **Use Exa Search MCP:** Query "Supabase create date ratings table"
- [ ] Create date_ratings table
- [ ] **Use Exa Search MCP:** Query "Supabase insert rating React form submission"
- [ ] Implement rating submission after video date
- [ ] **Use Exa Search MCP:** Query "Supabase calculate average rating aggregate query"
- [ ] Calculate and display average ratings
- [ ] Store feedback text

### Phase 10: Contact Exchange
- [ ] **Use Exa Search MCP:** Query "PostgreSQL pgcrypto encryption contact details"
- [ ] Create contact_details table with encrypted fields (pgcrypto)
- [ ] **Use Exa Search MCP:** Query "Supabase create contact exchanges table"
- [ ] Create contact_exchanges table
- [ ] **Use Exa Search MCP:** Query "React form checkboxes contact methods phone email"
- [ ] Implement contact details form with checkboxes (phone, email, instagram, whatsapp)
- [ ] **Use Exa Search MCP:** Query "PostgreSQL pgcrypto encrypt decrypt functions"
- [ ] Implement encryption for contact details using pgcrypto
- [ ] **Use Exa Search MCP:** Query "Supabase contact exchange logic mutual yes after date"
- [ ] Implement exchange logic (only when both say yes after video date)
- [ ] **Use Exa Search MCP:** Query "PostgreSQL decrypt display contacts secure"
- [ ] Decrypt and display exchanged contacts securely
- [ ] **Use Exa Search MCP:** Query "Supabase RLS policies encrypted contact details"
- [ ] Add RLS policies for contact details

### Phase 11: Reporting & Moderation
- [ ] **Use Exa Search MCP:** Query "Supabase create reports table categories"
- [ ] Create reports table with 8 categories
- [ ] **Use Exa Search MCP:** Query "Supabase create blocked users table"
- [ ] Create blocked_users table
- [ ] **Use Exa Search MCP:** Query "React report submission form category selection"
- [ ] Implement report submission with category selection
- [ ] **Use Exa Search MCP:** Query "PostgreSQL trigger automatic moderation actions shadow block"
- [ ] Implement automatic actions:
  - Repeated serious reports → shadow block
  - Underage/sexual content → immediate suspension
  - Camera refusal → visibility reduction
- [ ] **Use Exa Search MCP:** Query "Supabase block user functionality React"
- [ ] Implement user blocking functionality
- [ ] **Use Exa Search MCP:** Query "Supabase admin moderation interface RLS policies"
- [ ] Create moderation interface (admin-only)
- [ ] Track auto_action_taken in reports table

### Phase 12: Real-time Features
- [ ] **Use Exa Search MCP:** Query "Supabase Realtime subscriptions matches React hooks"
- [ ] Set up Supabase Realtime subscriptions for matches
- [ ] **Use Exa Search MCP:** Query "Supabase real-time notifications React toast"
- [ ] Implement real-time match notifications
- [ ] **Use Exa Search MCP:** Query "Supabase real-time vote updates React state"
- [ ] Implement real-time vote updates
- [ ] **Use Exa Search MCP:** Query "Supabase presence tracking online offline status"
- [ ] Add presence tracking (online/offline status)

## Requirements & Decisions (From Code Analysis & Discussion)

### ✅ Answers from Existing Code

#### Video Date System
- **Pre-date Countdown**: 15 seconds (fixed)
- **Date Duration**: 5 minutes (300 seconds, fixed)
- **Dates Start**: Immediately after matching (no scheduling)
- **Vote Countdown**: 10 seconds on spin page

#### Matching Flow (From Code)
- Both users vote "yes" → Immediately redirect to `/video-date`
- User votes "yes" but other passed → Auto-spin to next profile
- User votes "pass" → Immediately spin to next profile
- User doesn't vote within 10 seconds → Reset to start screen

#### Contact Exchange (From Code)
- Contacts exchanged **after** both users say "yes" **after** video date completes
- Happens in post-date modal flow

#### Rating/Feedback (From Code)
- Rating and feedback are **optional** (only submitted if provided)

---

### ✅ Decisions Made (From Discussion)

#### Matching System

**Profile Discovery Algorithm:**
- **Fetch users by strict filters first:**
  - Age range (user's min_age to max_age preferences)
  - Distance range (user's max_distance preference)
  - Location proximity (using lat/lng coordinates)
  - Gender preference (if applicable)

**Always Exclude:**
- Permanent matches (users already matched)
- Users currently in a video date
- Offline users
- Users who already passed on the current user

**Passed Profiles:**
- Should not appear again for **24 hours** unless the pool becomes empty
- After 24 hours, can reappear if no other matches available

**Real-time Logic:**
- Matching must be **instant** (real-time, no batching)
- Detect mutual "yes" votes in real-time with no batching
- Video date must start **immediately** when both vote "yes"
- **Use BOTH Supabase Realtime subscriptions (client-side) AND database trigger (server-side)** for maximum reliability

**Bidirectional Preference Check:**
- **Both users must match each other's preferences** for best match quality
- User A sees User B only if:
  - B matches A's preferences (age, distance, gender)
  - A matches B's preferences (age, distance, gender)
- This ensures mutual compatibility and better match quality

**Filter Softening (When Pool is Empty):**
1. **First relaxation:** Increase distance by 50% (e.g., 50km → 75km)
2. **Second relaxation:** Expand age range by ±5 years
3. **Third relaxation:** Remove gender preference (show all genders)
4. **Last resort:** Show offline users (with "offline" badge)

**Fairness Boost:**
- Users with < 5 matches get priority boost (0.5 points)
- Users with < 10 matches get smaller boost (0.2 points)
- Helps new users get discovered faster
- Applied in ORDER BY clause: distance → fairness_boost → activity → freshness

**Match Detection:**
- **Database trigger** automatically checks for mutual matches on vote insert
- **Supabase Realtime subscription** provides instant client-side notification
- **2-minute vote validity window** (only recent votes count for matching)
- **10-second timeout** before auto-spin if no match detected

#### Video Date System

**Video Calling:**
- **Service: LiveKit Cloud**
  - No heavy setup required
  - Stable one-to-one calls
  - Budget-friendly
  - Works well with Next.js

**Early Exit Handling:**
- If one user leaves early, the date ends for **both** users
- The outcome is auto-marked as **"pass"**
- Both users return to the spin page
- Early leavers receive a **small visibility penalty** to protect good users

#### Contact Exchange

**Privacy Controls:**
- Users should choose which contact methods to share:
  - Phone
  - Email
  - Instagram
  - WhatsApp
- Contact details must be **encrypted in the database**
- Reveal details only **after both users submit** their contact details

#### Reporting

**Report Categories:**
1. Inappropriate behaviour
2. Harassment
3. Sexual content
4. Camera refusal
5. Fake profile
6. Underage suspicion
7. Scam attempts
8. Hate speech

**Automatic Actions:**
- **Repeated serious reports** → Trigger automatic shadow block
- **Underage or sexual content** → Trigger immediate suspension
- **Camera refusal** → Can reduce visibility but not ban

#### Profile Discovery

**Location:**
- Use **precise coordinates** (lat and lng)
- Distance calculated with **Haversine formula** for accuracy

**Profile Queue:**
- Preload only **three profiles at a time**:
  - One active profile
  - Two backup profiles
- **Prioritization order:**
  1. Closest distance first
  2. Highest activity second
  3. Freshness (newest profiles) third

#### Matching Algorithm Priorities

**Priority Order:**
1. **Real-time detection** (instant matching)
2. **Strict filters then softening** (apply all filters strictly first, then relax if pool is empty)
3. **Avoid repeats and bad matches** (exclude passed users, current dates, offline users)
4. **Distance priority** (closest users shown first)
5. **Fairness boosts** for under-matched users (users with fewer matches get slight priority boost)

## Additional Database Requirements

### Extensions Needed
```sql
-- Enable pgcrypto for contact details encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Optional: Enable PostGIS for advanced geospatial queries (if needed)
-- CREATE EXTENSION IF NOT EXISTS postgis;
```

### Functions Needed

**Haversine Distance Calculation Function:**
```sql
CREATE OR REPLACE FUNCTION calculate_distance(
  lat1 DECIMAL,
  lon1 DECIMAL,
  lat2 DECIMAL,
  lon2 DECIMAL
) RETURNS DECIMAL AS $$
DECLARE
  earth_radius DECIMAL := 6371; -- Earth radius in kilometers
  dlat DECIMAL;
  dlon DECIMAL;
  a DECIMAL;
  c DECIMAL;
BEGIN
  dlat := radians(lat2 - lat1);
  dlon := radians(lon2 - lon1);
  
  a := sin(dlat/2) * sin(dlat/2) + 
       cos(radians(lat1)) * cos(radians(lat2)) * 
       sin(dlon/2) * sin(dlon/2);
  
  c := 2 * atan2(sqrt(a), sqrt(1-a));
  
  RETURN earth_radius * c;
END;
$$ LANGUAGE plpgsql;
```

**Profile Discovery Query (Example):**
```sql
-- This query would be used to fetch potential matches
-- Priority: distance, activity, freshness
-- Includes gender preference filtering
SELECT p.*, 
       calculate_distance(
         :user_lat, :user_lng, 
         p.latitude, p.longitude
       ) AS distance_km
FROM profiles p
INNER JOIN user_preferences up ON up.user_id = :current_user_id
WHERE p.id != :current_user_id
  -- Age range filter (user's preferences)
  AND p.age BETWEEN up.min_age AND up.max_age
  -- Gender preference filter (user's preference)
  AND (
    up.gender_preference = 'all' OR
    p.gender = up.gender_preference OR
    (up.gender_preference = 'non-binary' AND p.gender = 'non-binary')
  )
  -- Online status
  AND p.is_online = TRUE
  -- Distance filter (user's max_distance preference)
  AND calculate_distance(:user_lat, :user_lng, p.latitude, p.longitude) <= up.max_distance
  -- Exclude profiles viewed in last 24 hours
  AND p.id NOT IN (
    SELECT viewed_profile_id 
    FROM profile_views 
    WHERE viewer_id = :current_user_id 
      AND viewed_at > NOW() - INTERVAL '24 hours'
  )
  -- Exclude permanent matches
  AND p.id NOT IN (
    SELECT CASE 
      WHEN user1_id = :current_user_id THEN user2_id 
      ELSE user1_id 
    END
    FROM matches 
    WHERE (user1_id = :current_user_id OR user2_id = :current_user_id)
      AND status != 'unmatched'
  )
  -- Exclude users currently in a video date
  AND p.id NOT IN (
    SELECT CASE 
      WHEN user1_id = :current_user_id THEN user2_id 
      ELSE user1_id 
    END
    FROM video_dates 
    WHERE (user1_id = :current_user_id OR user2_id = :current_user_id)
      AND status IN ('countdown', 'active')
  )
  -- Exclude users who passed on current user
  AND p.id NOT IN (
    SELECT voter_id
    FROM votes
    WHERE profile_id = :current_user_id
      AND vote_type = 'pass'
  )
  -- Exclude blocked users
  AND p.id NOT IN (
    SELECT blocked_user_id
    FROM blocked_users
    WHERE blocker_id = :current_user_id
  )
  -- Exclude users who blocked current user (handled by RLS, but explicit for clarity)
  AND p.id NOT IN (
    SELECT blocker_id
    FROM blocked_users
    WHERE blocked_user_id = :current_user_id
  )
ORDER BY 
  distance_km ASC,
  p.last_active_at DESC,
  p.created_at DESC
LIMIT 3;
```

**Note:** The above query is a simplified example. The actual implementation uses the `discover_profiles()` database function (see below) which includes bidirectional preference checking, fairness boost, and filter softening.

---

## Matching Algorithm: Complete Implementation

### Database Functions & Triggers

#### 1. Check Mutual Match Function
```sql
CREATE OR REPLACE FUNCTION check_mutual_match(
  user1_id UUID,
  user2_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM votes v1
    INNER JOIN votes v2 
      ON v1.voter_id = v2.profile_id 
      AND v1.profile_id = v2.voter_id
    WHERE v1.voter_id = user1_id
      AND v1.profile_id = user2_id
      AND v2.voter_id = user2_id
      AND v2.profile_id = user1_id
      AND v1.vote_type = 'yes'
      AND v2.vote_type = 'yes'
      AND v1.created_at > NOW() - INTERVAL '2 minutes'
      AND v2.created_at > NOW() - INTERVAL '2 minutes'
  );
END;
$$ LANGUAGE plpgsql;
```

#### 2. Auto-Match Detection Trigger
```sql
CREATE OR REPLACE FUNCTION handle_vote_insert()
RETURNS TRIGGER AS $$
DECLARE
  mutual_match BOOLEAN;
  user1_id UUID;
  user2_id UUID;
BEGIN
  -- Only process 'yes' votes
  IF NEW.vote_type != 'yes' THEN
    RETURN NEW;
  END IF;
  
  -- Check for mutual match
  mutual_match := check_mutual_match(NEW.voter_id, NEW.profile_id);
  
  IF mutual_match THEN
    -- Ensure consistent ordering (user1_id < user2_id)
    user1_id := LEAST(NEW.voter_id, NEW.profile_id);
    user2_id := GREATEST(NEW.voter_id, NEW.profile_id);
    
    -- Create match (with error handling for duplicates)
    INSERT INTO matches (user1_id, user2_id, status)
    VALUES (user1_id, user2_id, 'pending')
    ON CONFLICT (user1_id, user2_id) DO NOTHING;
    
    -- Notify both users via Supabase Realtime
    PERFORM pg_notify('match_created', json_build_object(
      'user1_id', user1_id,
      'user2_id', user2_id,
      'matched_at', NOW()
    )::text);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_vote_insert
  AFTER INSERT ON votes
  FOR EACH ROW
  WHEN (NEW.vote_type = 'yes')
  EXECUTE FUNCTION handle_vote_insert();
```

#### 3. Discover Profiles Function (Complete with Bidirectional Check)
```sql
CREATE OR REPLACE FUNCTION discover_profiles(
  current_user_id UUID,
  limit_count INTEGER DEFAULT 3,
  soften_filters BOOLEAN DEFAULT FALSE
) RETURNS TABLE (
  id UUID,
  name TEXT,
  age INTEGER,
  bio TEXT,
  photo TEXT,
  location TEXT,
  distance_km DECIMAL,
  fairness_boost DECIMAL
) AS $$
DECLARE
  user_prefs RECORD;
  current_user_profile RECORD;
  distance_multiplier DECIMAL := 1.0;
  age_expansion INTEGER := 0;
  gender_filter TEXT;
BEGIN
  -- Get current user's preferences and profile
  SELECT * INTO user_prefs
  FROM user_preferences
  WHERE user_id = current_user_id;
  
  SELECT * INTO current_user_profile
  FROM profiles
  WHERE id = current_user_id;
  
  -- Apply filter softening if needed
  IF soften_filters THEN
    distance_multiplier := 1.5; -- 50% increase
    age_expansion := 5; -- ±5 years
    gender_filter := 'all'; -- Remove gender filter
  ELSE
    gender_filter := user_prefs.gender_preference;
  END IF;
  
  RETURN QUERY
  SELECT 
    p.id,
    p.name,
    p.age,
    p.bio,
    p.photo,
    p.location,
    calculate_distance(
      current_user_profile.latitude,
      current_user_profile.longitude,
      p.latitude,
      p.longitude
    ) AS distance_km,
    -- Fairness boost: users with < 5 matches get priority
    CASE 
      WHEN COALESCE(match_count, 0) < 5 THEN 0.5
      WHEN COALESCE(match_count, 0) < 10 THEN 0.2
      ELSE 0
    END AS fairness_boost
  FROM profiles p
  LEFT JOIN (
    SELECT 
      CASE 
        WHEN user1_id = current_user_id THEN user2_id 
        ELSE user1_id 
      END as matched_user_id,
      COUNT(*) as match_count
    FROM matches
    WHERE (user1_id = current_user_id OR user2_id = current_user_id)
      AND status != 'unmatched'
    GROUP BY matched_user_id
  ) match_stats ON p.id = match_stats.matched_user_id
  INNER JOIN user_preferences up_other ON up_other.user_id = p.id
  WHERE p.id != current_user_id
    -- Current user's preferences (with softening)
    AND p.age BETWEEN (user_prefs.min_age - age_expansion) AND (user_prefs.max_age + age_expansion)
    AND (
      gender_filter = 'all' OR
      p.gender = gender_filter OR
      (gender_filter = 'non-binary' AND p.gender = 'non-binary')
    )
    AND calculate_distance(
      current_user_profile.latitude,
      current_user_profile.longitude,
      p.latitude,
      p.longitude
    ) <= (user_prefs.max_distance * distance_multiplier)
    -- BIDIRECTIONAL CHECK: Other user's preferences must also match current user
    AND current_user_profile.age BETWEEN up_other.min_age AND up_other.max_age
    AND (
      up_other.gender_preference = 'all' OR
      current_user_profile.gender = up_other.gender_preference OR
      (up_other.gender_preference = 'non-binary' AND current_user_profile.gender = 'non-binary')
    )
    AND calculate_distance(
      p.latitude,
      p.longitude,
      current_user_profile.latitude,
      current_user_profile.longitude
    ) <= up_other.max_distance
    -- Online status (unless softening)
    AND (soften_filters OR p.is_online = TRUE)
    -- Exclusions (same as before)
    AND p.id NOT IN (
      SELECT viewed_profile_id 
      FROM profile_views 
      WHERE viewer_id = current_user_id 
        AND viewed_at > NOW() - INTERVAL '24 hours'
    )
    AND p.id NOT IN (
      SELECT CASE 
        WHEN user1_id = current_user_id THEN user2_id 
        ELSE user1_id 
      END
      FROM matches 
      WHERE (user1_id = current_user_id OR user2_id = current_user_id)
        AND status != 'unmatched'
    )
    AND p.id NOT IN (
      SELECT CASE 
        WHEN user1_id = current_user_id THEN user2_id 
        ELSE user1_id 
      END
      FROM video_dates 
      WHERE (user1_id = current_user_id OR user2_id = current_user_id)
        AND status IN ('countdown', 'active')
    )
    AND p.id NOT IN (
      SELECT voter_id
      FROM votes
      WHERE profile_id = current_user_id
        AND vote_type = 'pass'
    )
    AND p.id NOT IN (
      SELECT blocked_user_id
      FROM blocked_users
      WHERE blocker_id = current_user_id
    )
    AND p.id NOT IN (
      SELECT blocker_id
      FROM blocked_users
      WHERE blocked_user_id = current_user_id
    )
  ORDER BY 
    distance_km ASC,
    fairness_boost DESC,
    p.last_active_at DESC,
    p.created_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;
```

### Client-Side Implementation (TypeScript/React)

#### 1. Real-Time Match Detection
```typescript
// Subscribe to match notifications
useEffect(() => {
  const subscription = supabase
    .channel(`matches-${currentUserId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'matches',
      filter: `user1_id=eq.${currentUserId}`
    }, (payload) => {
      const match = payload.new
      if (match.user2_id === currentUserId || match.user1_id === currentUserId) {
        router.push(`/video-date?match_id=${match.id}`)
      }
    })
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'matches',
      filter: `user2_id=eq.${currentUserId}`
    }, (payload) => {
      const match = payload.new
      router.push(`/video-date?match_id=${match.id}`)
    })
    .subscribe()
  
  return () => {
    subscription.unsubscribe()
  }
}, [currentUserId])
```

#### 2. Vote Submission Flow
```typescript
const handleVote = async (voteType: 'yes' | 'pass') => {
  try {
    // 1. Save vote immediately
    await supabase.from('votes').insert({
      voter_id: currentUserId,
      profile_id: currentProfile.id,
      vote_type: voteType
    })
    
    // 2. Record profile view (for 24-hour exclusion)
    await supabase.from('profile_views').upsert({
      viewer_id: currentUserId,
      viewed_profile_id: currentProfile.id
    })
    
    // 3. If pass → move to next profile immediately
    if (voteType === 'pass') {
      loadNextProfile()
      return
    }
    
    // 4. If yes → show "waiting for match" state
    setWaitingForMatch(true)
    
    // 5. Start 10-second timeout
    const timeout = setTimeout(() => {
      if (!isMatched) {
        setWaitingForMatch(false)
        loadNextProfile() // Auto-spin if no match
      }
    }, 10000)
    
    // Real-time subscription will handle match detection and clear timeout
  } catch (error) {
    console.error('Error submitting vote:', error)
    // Retry logic or show error message
  }
}
```

#### 3. Profile Queue Management
```typescript
const [profileQueue, setProfileQueue] = useState<Profile[]>([])
const [currentProfile, setCurrentProfile] = useState<Profile | null>(null)

// Fetch profiles with filter softening if needed
const fetchProfiles = async (softenFilters = false) => {
  const { data, error } = await supabase.rpc('discover_profiles', {
    current_user_id: currentUserId,
    limit_count: 3,
    soften_filters: softenFilters
  })
  
  if (error) {
    console.error('Error fetching profiles:', error)
    return
  }
  
  if (data && data.length > 0) {
    setProfileQueue(data)
    setCurrentProfile(data[0])
  } else if (!softenFilters) {
    // Try with softened filters
    return fetchProfiles(true)
  } else {
    // No profiles available even with softened filters
    showEmptyPoolMessage()
  }
}

// Load next profile from queue
const loadNextProfile = () => {
  const newQueue = [...profileQueue]
  const nextProfile = newQueue.shift()
  
  if (nextProfile) {
    setCurrentProfile(nextProfile)
    setProfileQueue(newQueue)
    
    // If queue has < 2 profiles, fetch more in background
    if (newQueue.length < 2) {
      fetchProfiles(false) // Try strict filters first
    }
  } else {
    // Queue empty, fetch more
    fetchProfiles(false)
  }
}
```

## Notes
- Supabase automatically handles JWT token management and session persistence
- **Row Level Security (RLS) policies:**
  - Users can read/update their own profile and preferences
  - **CRITICAL:** Authenticated users can read other profiles for matching (excludes blocked users)
  - Users can see votes on their profile (needed for exclusion logic)
- Supabase Storage provides CDN for fast image delivery
- All API calls are made client-side using the Supabase JavaScript SDK
- No custom API routes needed - Supabase provides everything
- **Supabase Realtime** will be used for instant match detection and notifications
- **Location-based matching** uses Haversine formula (implemented as SQL function)
- **Gender preference filtering** is implemented in profile discovery query
- **Video calling** uses **LiveKit Cloud** (integrate `livekit-client` SDK)
- **Contact details encryption** uses PostgreSQL's `pgcrypto` extension
- **Profile discovery** uses complex SQL queries with distance calculation, gender preference, and exclusions
- **Real-time matching** uses Supabase Realtime subscriptions to detect mutual "yes" votes instantly
- **Database indexes** are critical for performance on large datasets (all major tables have indexes)
- **Onboarding completion** is tracked via `onboarding_completed` boolean field in profiles table
- **Matching Algorithm:**
  - **Bidirectional preference check:** Both users must match each other's preferences
  - **Real-time detection:** Database trigger + Supabase Realtime subscription (dual approach for reliability)
  - **Fairness boost:** Users with < 5 matches get priority (0.5 boost), < 10 matches get 0.2 boost
  - **Filter softening:** Progressive relaxation when pool is empty (distance → age → gender → offline)
  - **Profile queue:** Preload 3 profiles (1 active, 2 backups) with background fetching
  - **Match timeout:** 10 seconds before auto-spin if no match detected
  - **Vote validity:** 2-minute window for mutual match detection

