# Browserbase Realistic Testing Suite

This test suite uses **Browserbase MCP** to create multiple browser sessions that simulate real user behavior with realistic timing, network conditions, and coordinated multi-user scenarios.

## Why This Approach?

Unlike standard Playwright/Vitest tests that:
- Run sequentially with predictable timing
- Use clean database state
- Test on localhost
- Miss race conditions and real-world issues

This suite:
- ✅ Runs multiple **real browser sessions** in parallel
- ✅ Simulates **realistic user behavior** (random delays, thinking time)
- ✅ Tests **race conditions** (simultaneous actions)
- ✅ Verifies **state consistency** across all users
- ✅ Tests **recovery scenarios** (refreshes, network issues)
- ✅ Uses **cloud-based browsers** (more realistic network conditions)

## Prerequisites

1. **Browserbase MCP configured** - See `BROWSERBASE_SETUP.md`
2. **Server running** - `npm run dev` (on port 3000)
3. **Test users created** - Users must exist in Supabase with completed onboarding
4. **Environment variables**:
   ```bash
   TEST_APP_URL=http://localhost:3000
   TEST_USER1_EMAIL=testuser1@example.com
   TEST_USER1_PASSWORD=testpass123
   TEST_USER2_EMAIL=testuser2@example.com
   TEST_USER2_PASSWORD=testpass123
   ```

## Test Scenarios

### 1. Both Users Vote Yes
- Two users spin, get matched, both vote "yes"
- **Expected**: Both redirect to `/video-date`
- **Verifies**: Match outcome is `both_yes`, video date created

### 2. One Yes, One Pass
- User 1 votes "yes", User 2 votes "pass"
- **Expected**: Both redirect to `/spinning` (both respin)
- **Verifies**: Match outcome is `pass_pass`

### 3. Both Users Vote Pass
- Both users vote "pass"
- **Expected**: Both redirect to `/spinning`
- **Verifies**: Match outcome is `pass_pass`

### 4. User Refreshes During Vote
- User 1 votes, User 2 refreshes page
- **Expected**: User 2 recovers and can still vote
- **Verifies**: State recovery works correctly

### 5. Slow Network Conditions
- Simulates 3G network speeds
- **Expected**: All actions complete despite delays
- **Verifies**: App works under slow network conditions

### 6. Simultaneous Voting (Race Condition)
- Both users vote at the exact same time
- **Expected**: Both votes recorded correctly
- **Verifies**: No race conditions in voting logic

## Usage

### Run All Scenarios
```bash
npm run test:browserbase:realistic
```

### Run Single Scenario
```bash
npm run test:browserbase:scenario -- "Both Users Vote Yes"
```

### Run Specific Scenario by Name
```bash
npm run test:browserbase:scenario -- "Simultaneous Voting"
```

## Architecture

```
tests/browserbase-realistic/
├── orchestrator.ts          # Test orchestrator and session management
├── scenarios.ts              # Test scenario definitions
├── browserbase-impl.ts       # Browserbase MCP implementation
├── run-tests.ts              # Main test runner
└── README.md                 # This file
```

## How It Works

1. **Session Creation**: Creates multiple Browserbase browser sessions (one per user)
2. **Realistic Behavior**: Adds random delays, simulates human thinking time
3. **Coordinated Actions**: Executes actions across multiple users simultaneously
4. **State Verification**: Checks database state to verify correctness
5. **Recovery Testing**: Tests edge cases like refreshes and network issues

## Realistic Behavior Features

- **Human Delays**: Random delays between 0.5-3 seconds (simulates reading/thinking)
- **Fast Users**: Some users act quickly (0.2-1 second)
- **Slow Users**: Some users take time (2-5 seconds)
- **Network Delays**: Simulates network latency (0.1-0.5 seconds)
- **Random Timing**: 70% immediate action, 30% delayed (realistic distribution)
- **Simultaneous Actions**: True concurrency to test race conditions

## State Verification

The suite verifies:
- ✅ Both users are in the same match
- ✅ Match outcome is correct (`both_yes`, `pass_pass`, etc.)
- ✅ Both users are in correct state (`waiting`, `matched`, etc.)
- ✅ Video dates are created correctly
- ✅ Votes are recorded correctly

## Troubleshooting

### "Server not running"
- Start the dev server: `npm run dev`

### "Users did not get matched"
- Check that test users exist in Supabase
- Verify users have completed onboarding
- Check that matching logic is working

### "Browserbase session creation failed"
- Verify Browserbase MCP is configured correctly
- Check API key and Project ID in `~/.cursor/mcp.json`
- Restart Cursor IDE after configuration

### "Verification failed"
- Check database state manually
- Review test logs for specific errors
- Verify database functions are working correctly

## Next Steps

1. **Add more scenarios**: Test video date connection, timer sync, etc.
2. **Add chaos testing**: Random failures, network interruptions
3. **Add load testing**: Test with 4+ users simultaneously
4. **Add monitoring**: Track performance metrics during tests

## Notes

- Tests use **real browser sessions** via Browserbase (not headless)
- Tests run in **parallel** to simulate real concurrency
- Tests verify **database state** to catch state inconsistencies
- Tests include **realistic timing** to catch timing-related bugs

