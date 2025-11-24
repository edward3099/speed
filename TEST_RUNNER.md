# Test Runner Guide

## Quick Start

### 1. Start the Development Server
```bash
npm run dev
```

### 2. Run All Tests
```bash
npm test
```

### 3. Run Tests with UI
```bash
npm run test:ui
```

### 4. Run Tests in Headed Mode (see browser)
```bash
npm run test:headed
```

### 5. Run Specific Test Suites
```bash
# Spin → Pairing → Video Date flow
npm run test:spin

# Timer synchronization tests
npm run test:timer

# Matching flow tests
npm run test:matching
```

### 6. Debug Tests
```bash
npm run test:debug
```

## Test Structure

### Test Files
- `tests/spin-pairing-video-date.spec.ts` - Full flow tests
- `tests/timer-synchronization.spec.ts` - Timer sync tests
- `tests/matching-flow.spec.ts` - Matching algorithm tests
- `tests/helpers.ts` - Helper functions

### Test Coverage

#### Spin Flow
- ✅ User can spin and enter queue
- ✅ Spinning animation works
- ✅ Queue management
- ✅ Preference handling

#### Pairing Flow
- ✅ Two users get matched
- ✅ Matching algorithm works
- ✅ Preference matching
- ✅ Fairness system
- ✅ No duplicate matches

#### Video Date Flow
- ✅ Video date starts after both vote yes
- ✅ Countdown timer synchronized
- ✅ Main timer synchronized
- ✅ Timer persists on refresh
- ✅ Video/audio tracks work
- ✅ End date flow works
- ✅ Partner notification works

## Environment Variables

Create a `.env.test` file for test configuration:

```env
TEST_USER1_EMAIL=testuser1@example.com
TEST_USER1_PASSWORD=testpass123
TEST_USER2_EMAIL=testuser2@example.com
TEST_USER2_PASSWORD=testpass123
```

## Test Data Requirements

Before running tests, ensure:
1. Test users exist in Supabase
2. Test users have complete profiles
3. LiveKit is configured
4. Database migrations are applied

## Running Tests in CI/CD

Tests can be run in CI/CD pipelines:

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install --with-deps

# Run tests
npm test
```

## Test Reports

After running tests, view the HTML report:
```bash
npx playwright show-report
```

## Debugging Failed Tests

1. Run tests in headed mode to see what's happening:
   ```bash
   npm run test:headed
   ```

2. Use debug mode to step through tests:
   ```bash
   npm run test:debug
   ```

3. Check screenshots and videos in `test-results/` directory

4. Check console logs in test output

## Adding New Tests

1. Create a new test file in `tests/` directory
2. Import necessary functions from `@playwright/test`
3. Use helper functions from `tests/helpers.ts`
4. Add data-testid attributes to components for easier testing

## Test Maintenance

- Update tests when UI changes
- Update selectors if component structure changes
- Keep test data clean (cleanup after tests)
- Document any test-specific setup requirements

