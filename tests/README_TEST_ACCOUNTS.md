# Test Accounts Setup Guide

## ✅ Current Status

**testuser1@example.com** is fully set up and ready for testing!

## Quick Start

Tests now use pre-created accounts instead of automating signup. This is:
- ✅ Faster (no signup/onboarding wait)
- ✅ More reliable (no flaky automation)
- ✅ Easier to debug

## Test User 1

**Email**: `testuser1@example.com`  
**Password**: `testpass123`

**Status**: ✅ Ready
- Profile created
- Preferences set
- Onboarding completed

## Creating Test User 2

To create testuser2 for two-user tests:

### Option 1: Manual Signup (Recommended)
1. Go to your app
2. Sign up with: `testuser2@example.com` / `testpass123`
3. Complete onboarding
4. Run the SQL script to update profile/preferences if needed

### Option 2: Use Setup Script
```bash
npm run test:setup-users
```

Note: This requires the user to exist first (created via signup).

### Option 3: SQL Only (if user exists)
Run the SQL in `tests/setup-test-accounts.sql` in Supabase SQL Editor.

## Using Test Accounts in Tests

```typescript
import { loginUser } from './helpers';

// Login with pre-created account
await loginUser(page, 'testuser1@example.com', 'testpass123');

// User is automatically redirected to /spin
// (because onboarding is already completed)
```

## Environment Variables

You can set these in `.env.local` or as environment variables:

```bash
TEST_USER1_EMAIL=testuser1@example.com
TEST_USER1_PASSWORD=testpass123
TEST_USER2_EMAIL=testuser2@example.com
TEST_USER2_PASSWORD=testpass123
```

## Benefits

✅ **No signup automation needed** - Just login  
✅ **Faster tests** - Skip onboarding  
✅ **More reliable** - Known accounts  
✅ **Easier debugging** - Consistent state  

