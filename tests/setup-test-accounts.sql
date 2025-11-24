-- Setup Test Accounts
-- Run this SQL in Supabase SQL Editor to create test users

-- Note: Users must be created via Supabase Auth API (signup)
-- This script creates profiles and preferences for existing users

-- Test User 1 Profile
INSERT INTO profiles (
  id, name, age, bio, gender, location, latitude, longitude, 
  photo, onboarding_completed, created_at, updated_at
)
SELECT 
  u.id,
  'Test User 1',
  25,
  'Test bio for automated testing',
  'male',
  'New York, United States',
  40.7128,
  -74.0060,
  'https://i.pravatar.cc/150?img=15',
  true,
  NOW(),
  NOW()
FROM auth.users u
WHERE u.email = 'testuser1@example.com'
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  age = EXCLUDED.age,
  bio = EXCLUDED.bio,
  gender = EXCLUDED.gender,
  location = EXCLUDED.location,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  onboarding_completed = true,
  updated_at = NOW();

-- Test User 1 Preferences
INSERT INTO user_preferences (
  user_id, min_age, max_age, max_distance, gender_preference, updated_at
)
SELECT 
  u.id, 18, 30, 50, 'female', NOW()
FROM auth.users u
WHERE u.email = 'testuser1@example.com'
ON CONFLICT (user_id) DO UPDATE SET
  min_age = EXCLUDED.min_age,
  max_age = EXCLUDED.max_age,
  max_distance = EXCLUDED.max_distance,
  gender_preference = EXCLUDED.gender_preference,
  updated_at = NOW();

-- Test User 2 Profile (if user exists)
INSERT INTO profiles (
  id, name, age, bio, gender, location, latitude, longitude, 
  photo, onboarding_completed, created_at, updated_at
)
SELECT 
  u.id,
  'Test User 2',
  23,
  'Test bio for automated testing',
  'female',
  'Los Angeles, United States',
  34.0522,
  -118.2437,
  'https://i.pravatar.cc/150?img=20',
  true,
  NOW(),
  NOW()
FROM auth.users u
WHERE u.email = 'testuser2@example.com'
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  age = EXCLUDED.age,
  bio = EXCLUDED.bio,
  gender = EXCLUDED.gender,
  location = EXCLUDED.location,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  onboarding_completed = true,
  updated_at = NOW();

-- Test User 2 Preferences (if user exists)
INSERT INTO user_preferences (
  user_id, min_age, max_age, max_distance, gender_preference, updated_at
)
SELECT 
  u.id, 18, 30, 50, 'male', NOW()
FROM auth.users u
WHERE u.email = 'testuser2@example.com'
ON CONFLICT (user_id) DO UPDATE SET
  min_age = EXCLUDED.min_age,
  max_age = EXCLUDED.max_age,
  max_distance = EXCLUDED.max_distance,
  gender_preference = EXCLUDED.gender_preference,
  updated_at = NOW();

