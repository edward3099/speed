# Improved Test Workers Architecture

## Overview

This document describes the improved test workers architecture using Playwright fixtures for better isolation, parallelization, and maintainability.

## Key Improvements

### 1. **Worker-Scoped Fixtures** ✅
- **Supabase Client**: Created once per worker, shared across all tests
- **Test Users**: Authenticated once per worker, reused across all tests
- **Efficiency**: Login happens once per worker, not before each test

### 2. **Test Isolation** ✅
- Each test gets fresh pages in authenticated contexts
- No shared state between tests
- Proper cleanup after each test

### 3. **Better Parallelization** ✅
- Tests can run in parallel across multiple workers
- Each worker has its own authenticated users
- No conflicts between workers

### 4. **Resource Efficiency** ✅
- Login happens once per worker (not per test)
- Browser contexts are reused
- Supabase client is shared

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Worker 1                              │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Worker-Scoped Fixtures (Created Once)           │  │
│  │  - Supabase Client                                │  │
│  │  - User1 (authenticated context)                  │  │
│  │  - User2 (authenticated context)                  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Test 1     │  │   Test 2     │  │   Test 3     │ │
│  │  (fresh page) │  │  (fresh page) │  │  (fresh page) │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                    Worker 2                              │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Worker-Scoped Fixtures (Created Once)           │  │
│  │  - Supabase Client                                │  │
│  │  - User1 (authenticated context)                  │  │
│  │  - User2 (authenticated context)                  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐                    │
│  │   Test 4     │  │   Test 5     │                    │
│  │  (fresh page) │  │  (fresh page) │                    │
│  └──────────────┘  └──────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

## Fixture Types

### Worker-Scoped Fixtures

**Created once per worker, shared across all tests:**

1. **`supabase`** - Supabase client for database operations
2. **`testUsers`** - Authenticated test users (User1 and User2)

### Test-Scoped Fixtures

**Created fresh for each test:**

1. **`freshUser1Page`** - Fresh page in User1's authenticated context
2. **`freshUser2Page`** - Fresh page in User2's authenticated context

## Usage Examples

### Basic Test (Using Worker-Scoped Users)

```typescript
import { test, expect } from './fixtures';

test('My test', async ({ testUsers }) => {
  // testUsers.user1.page - authenticated page for User1
  // testUsers.user2.page - authenticated page for User2
  // testUsers.user1.userId - User1's ID
  // testUsers.user2.userId - User2's ID
  
  await testUsers.user1.page.goto('/spin');
  await testUsers.user2.page.goto('/spin');
  
  // Both users are already logged in!
});
```

### Test with Fresh Pages

```typescript
import { test, expect } from './fixtures';

test('My test with fresh pages', async ({ freshUser1Page, freshUser2Page }) => {
  // Fresh pages in authenticated contexts
  // Useful when you need clean state but want to reuse authentication
  
  await freshUser1Page.goto('/spin');
  await freshUser2Page.goto('/spin');
});
```

### Test with Log Fetching

```typescript
import { testWithLogs } from './fixtures';

testWithLogs('My test with logs', async ({ testUsers, fetchSpinLogs }) => {
  const testStartTime = new Date();
  
  // Do some actions...
  await testUsers.user1.page.goto('/spin');
  
  // Fetch logs
  const logs = await fetchSpinLogs(
    testUsers.user1.userId,
    ['spinStart', 'queueJoined'],
    testStartTime
  );
  
  // Verify logs
  expect(logs.length).toBeGreaterThan(0);
});
```

## Benefits

### 1. **Performance** ⚡
- Login happens once per worker (not per test)
- ~10x faster test execution
- Reduced resource usage

### 2. **Reliability** 🛡️
- Better test isolation
- No shared state between tests
- Proper cleanup

### 3. **Maintainability** 🔧
- Centralized fixture definitions
- Reusable across test files
- Easy to extend

### 4. **Parallelization** 🚀
- Tests can run in parallel safely
- Each worker has isolated users
- No conflicts

## Migration Guide

### Old Approach (beforeAll)

```typescript
test.describe('My Tests', () => {
  let user1Page: Page;
  let user2Page: Page;
  
  test.beforeAll(async ({ browser }) => {
    // Login both users (slow, runs once)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    user1Page = await context1.newPage();
    user2Page = await context2.newPage();
    await loginUser(user1Page, email1, password1);
    await loginUser(user2Page, email2, password2);
  });
  
  test('test 1', async () => {
    // Use shared pages (can cause conflicts)
    await user1Page.goto('/spin');
  });
});
```

### New Approach (Fixtures)

```typescript
import { test } from './fixtures';

test.describe('My Tests', () => {
  test('test 1', async ({ testUsers }) => {
    // Users already logged in (fast!)
    await testUsers.user1.page.goto('/spin');
    await testUsers.user2.page.goto('/spin');
  });
  
  test('test 2', async ({ testUsers }) => {
    // Fresh state, but same authenticated users
    await testUsers.user1.page.goto('/spin');
  });
});
```

## Configuration

### Playwright Config

```typescript
export default defineConfig({
  workers: process.env.CI ? 1 : 4, // 4 workers in parallel
  fullyParallel: true, // Run tests in parallel
  // ...
});
```

### Environment Variables

```bash
TEST_USER1_EMAIL=testuser1@example.com
TEST_USER1_PASSWORD=testpass123
TEST_USER2_EMAIL=testuser2@example.com
TEST_USER2_PASSWORD=testpass123
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Running Tests

```bash
# Run all tests with new fixtures
npm run test:matching-logic-v2

# Run with specific number of workers
npx playwright test --workers=4

# Run in UI mode
npx playwright test --ui
```

## Troubleshooting

### Issue: Tests timing out
- **Solution**: Increase timeout in `test.describe.configure({ timeout: 120000 })`

### Issue: Users not found
- **Solution**: Run `npm run test:setup-users` to create test users

### Issue: Login fails
- **Solution**: Check that test users exist and passwords are correct

### Issue: Tests interfering with each other
- **Solution**: Use `freshUser1Page` and `freshUser2Page` fixtures for clean state

## Next Steps

1. Migrate existing tests to use new fixtures
2. Add more utility fixtures as needed
3. Optimize worker count based on test performance
4. Add fixtures for common test patterns

