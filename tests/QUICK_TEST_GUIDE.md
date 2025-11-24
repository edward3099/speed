# Quick Test Guide

## Running Tests

### Prerequisites
1. Development server running: `npm run dev`
2. Test users created in Supabase
3. LiveKit configured

### Quick Commands

```bash
# Run all tests
npm test

# Run with UI (recommended for first time)
npm run test:ui

# Run specific test suite
npm run test:spin      # Spin → Pairing → Video Date
npm run test:timer     # Timer synchronization
npm run test:matching  # Matching algorithm

# Debug a test
npm run test:debug
```

## Test Scenarios Covered

### ✅ Spin Flow
- User can spin and enter queue
- Spinning animation works
- User stays in queue until matched

### ✅ Pairing Flow  
- Two users get matched
- Both see reveal animation
- Both enter vote state

### ✅ Video Date Flow
- Countdown timer synchronized
- Main timer synchronized
- Timer persists on refresh
- End date flow works
- Partner notification works

## Test Data Setup

Before running tests, create test users:

```sql
-- Create test users in Supabase
-- User 1
INSERT INTO profiles (id, name, age, bio, photo, location, gender)
VALUES (
  'test-user-1-id',
  'Test User 1',
  25,
  'Test bio',
  'https://example.com/photo1.jpg',
  'New York',
  'male'
);

-- User 2
INSERT INTO profiles (id, name, age, bio, photo, location, gender)
VALUES (
  'test-user-2-id',
  'Test User 2',
  27,
  'Test bio',
  'https://example.com/photo2.jpg',
  'New York',
  'female'
);
```

## Common Issues

### Tests fail with "Element not found"
- Check that `data-testid` attributes are in components
- Verify server is running
- Check browser console for errors

### Tests timeout
- Increase timeout in test file
- Check network connectivity
- Verify Supabase connection

### Timer synchronization fails
- Verify database RPC functions exist
- Check unique constraint on match_id
- Verify triggers are applied

## Next Steps

1. Run tests: `npm run test:ui`
2. Review test results
3. Fix any failing tests
4. Add more test scenarios as needed

