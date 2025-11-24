# Test Accounts Setup

## ✅ Test User 1 - Ready!

**Email**: `testuser1@example.com`  
**Password**: `testpass123`

**Profile**:
- Name: Test User 1
- Age: 25
- Gender: male
- Bio: Test bio for automated testing
- Location: New York, United States
- Onboarding: ✅ Completed

**Preferences**:
- Min Age: 18
- Max Age: 30
- Max Distance: 50 miles
- Gender Preference: female

## Setup Status

✅ **testuser1@example.com** - Fully configured and ready for testing
- ✅ Auth user exists
- ✅ Profile created
- ✅ Preferences set
- ✅ Onboarding completed

## How to Use in Tests

The tests now use pre-created accounts instead of trying to automate signup:

```typescript
import { loginUser } from './helpers';

// Login with pre-created test user
await loginUser(page, 'testuser1@example.com', 'testpass123');

// User will be redirected to /spin page automatically
// (since onboarding is already completed)
```

## Creating Additional Test Users

To create testuser2 or more users:

1. **Create user via Supabase Auth** (can't be done via SQL):
   - Use the Supabase dashboard
   - Or use the setup script: `npm run test:setup-users`
   - Or sign up manually once, then run the SQL script

2. **Create profile and preferences** (via SQL):
   - Run the SQL in `tests/setup-test-accounts.sql`
   - Or use Supabase MCP to execute the SQL

## Benefits of This Approach

✅ **Faster tests** - No need to wait for signup/onboarding  
✅ **More reliable** - No flaky signup automation  
✅ **Easier debugging** - Known test accounts  
✅ **Consistent state** - Same users every time  

## Test User Credentials

Store these in environment variables if needed:
```bash
TEST_USER1_EMAIL=testuser1@example.com
TEST_USER1_PASSWORD=testpass123
TEST_USER2_EMAIL=testuser2@example.com
TEST_USER2_PASSWORD=testpass123
```

