# E2E Test Suite

## Overview

This directory contains end-to-end tests for the speed dating application, focusing on:
1. **Spinning** - User initiates matching
2. **Pairing** - System matches two users  
3. **Video Date** - Matched users have a video call

## Test Files

### `spin-pairing-video-date.spec.ts`
Comprehensive tests for the complete user journey:
- User spinning and entering queue
- Two users getting matched
- Both users voting yes → video date
- Countdown timer synchronization
- Main timer synchronization
- Timer persistence on refresh
- End date confirmation flow
- Partner notification when date ends
- Video/audio functionality
- Complete flow from spin to video date

### `timer-synchronization.spec.ts`
Focused tests on timer synchronization:
- Countdown timer uses database NOW()
- Main timer uses database RPC
- Timer continues after refresh
- Both users see same timer after refresh
- Timer tied to matchId, not user session

### `matching-flow.spec.ts`
Tests for matching algorithm:
- Every spin results in pairing
- Users exit queue when paired
- Preference matching works
- No duplicate matches
- Fairness system works

### `helpers.ts`
Utility functions for tests:
- `loginUser()` - Login helper
- `waitForQueue()` - Wait for queue state
- `waitForMatch()` - Wait for match
- `getTimerValue()` - Extract timer value
- `waitForCountdownComplete()` - Wait for countdown
- `setupVideoDate()` - Setup video date for testing

## Running Tests

See `TEST_RUNNER.md` for detailed instructions.

Quick commands:
```bash
npm test              # Run all tests
npm run test:ui       # Run with UI
npm run test:headed   # Run in browser
npm run test:debug    # Debug mode
```

## Test Data Requirements

Tests require:
- Two test user accounts
- Complete user profiles
- Supabase database configured
- LiveKit configured

## Adding Data-TestId Attributes

For tests to work, components need `data-testid` attributes:

```tsx
// Example: Countdown timer
<div data-testid="countdown-timer">
  {countdown}
</div>

// Example: Main timer
<div data-testid="main-timer">
  {timeLeft}
</div>

// Example: Spinning state
<div data-testid="spinning">
  {/* spinning animation */}
</div>

// Example: Matched partner
<div data-testid="matched-partner">
  {/* partner info */}
</div>
```

## Test Maintenance

- Keep tests updated with UI changes
- Update selectors when components change
- Clean up test data after tests
- Document test-specific requirements

